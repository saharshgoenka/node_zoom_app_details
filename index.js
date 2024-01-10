const puppeteer = require('puppeteer');
const fspromise = require('fs').promises; // Use fs.promises for async file operations
require('dotenv').config();
const nodemailer = require('nodemailer');
const { exec } = require('child_process');
const path = require('path');

const delay = ms => new Promise(res => setTimeout(res, ms));

const fs = require('fs');
const {writeFile} = require("fs");

(async () => {
    const currentDate = new Date().toISOString().split('T')[0].replace(/[^0-9]/g, '-');

    let errorCount = 0;
    const startTime = Date.now(); // Record the start time
    let lineNumber = 0; // Initialize the line number
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0);
    let logContent = "";

    let file_path_prefix = "/mnt/data/projects/zoom-app-privacy-data/data/"

    // Check if the directory exists, and create it if it doesn't
    if (!fs.existsSync(file_path_prefix + `${currentDate}/links/`)) {
        fs.mkdirSync(file_path_prefix + `${currentDate}/links/`, {recursive: true});
    }

    if (!fs.existsSync(file_path_prefix + `${currentDate}/app-data/`)) {
        fs.mkdirSync(file_path_prefix + `${currentDate}/app-data/`, {recursive: true});
    }

    if (!fs.existsSync(file_path_prefix + `${currentDate}/site-snapshots/`)) {
        fs.mkdirSync(file_path_prefix + `${currentDate}/site-snapshots/`, {recursive: true});
    }

    if (!fs.existsSync(file_path_prefix + `${currentDate}/logs/`)) {
        fs.mkdirSync(file_path_prefix + `${currentDate}/logs/`, {recursive: true});
    }

    let allAppLinks = []
    let linksFailedToLoad = []; // Array to store failed links

    const zoomBaseURL = 'https://marketplace.zoom.us';

    const logsFilePath = file_path_prefix + `${currentDate}/logs/logs.txt`;

    for (let i = 1; i < 2; i++) {
        try {
            // Navigate to the website
            await page.goto(`${zoomBaseURL}/apps?page=${i}`, {timeout: 60000});
            await page.waitForSelector('.css-4xcoe5', {timeout: 10000});

            // Wait for the links to load
            let links = [];

            while (true) {
                // Use page.$$eval to extract all links
                links = await page.$$eval('a[class="css-4xcoe5"]', (elements) => {
                    return elements.map((element) => element.getAttribute('href'));
                });

                // Check if any of the links is '/apps/undefined'
                if (!links.includes('/apps/undefined')) {
                    break; // Exit the loop when there are no '/apps/undefined' links
                }

                // If there are '/apps/undefined' links, wait for a while and then check again
                await page.waitForTimeout(1000); // Wait for 1 second before rechecking
            }

            // Add the baseURL to each link
            links = links.map((link) => `${zoomBaseURL}${link}`);

            console.log(links);
            allAppLinks = allAppLinks.concat(links);
        } catch (error) {
            logContent += `Failed to load directory page: ${zoomBaseURL}/apps?page=${i}\n`;
        }
    }

    console.log('Links:', allAppLinks);

    const filePath = file_path_prefix + `${currentDate}/links/links.txt`;

    // Convert the array of links to a newline-separated string
    const linksString = allAppLinks.join('\n');

    // Write the links to the text file
    writeFile(filePath, linksString, (err) => {
        if (err) {
            console.error('Error writing to the file:', err);
        } else {
            console.log('Links have been written to', filePath);
        }
    });

    console.log(currentDate)
    // Append the current date to the file name
    const outputFilePath = file_path_prefix + `${currentDate}/app-data/zoom_marketplace_${currentDate}.json`;

    // Read the links from the text file
    fs.readFile(filePath, 'utf8', async (err, data) => {
        if (err) {
            console.error('Error reading the file:', err);
            await browser.close();
            return;
        }
        const links = data.trim().split('\n');
        const itemsArray = [];


        for (const link of links) {
            await processLink(link);

            const waitTime = 2;
            console.log("Starting " + waitTime + " second wait:");
            for (let i = 1; i < (waitTime + 1); i++) {
                await delay(1000);
                process.stdout.write(i + " ");
            }
            console.log("\nCompleted waiting for " + waitTime + " seconds");
        }


        // Retry for failed links
        console.log('Retrying for failed links...');
        fs.appendFileSync(logsFilePath, 'Retrying for failed links...'); // Log the failure

        const retryFailedLinks = [...linksFailedToLoad]; // Copy to prevent modification during iteration


        linksFailedToLoad = []; // Reset for the second attempt

        for (const link of retryFailedLinks) {
            await processLink(link);
        }

        // Log the final failed links
        if (linksFailedToLoad.length > 0) {
            logContent += `Failed to load after retry:\n${linksFailedToLoad.join('\n')}\n`;
        } else {
            logContent += `\nAll links loaded successfully after retry!\n`;
        }

        // Write all items as a JSON array to the output JSON file
        fs.writeFile(outputFilePath, JSON.stringify(itemsArray, null, 4), (err) => {
            if (err) {
                console.error('Error writing the output file:', err);
            } else {
                console.log('Items have been written to', outputFilePath);
                console.log('Error Count: ', errorCount)
                const endTime = Date.now(); // Record the end time
                const executionTime = (endTime - startTime) / 1000; // Calculate execution time in seconds
                console.log('Program execution time:', executionTime, 'seconds');
            }
        });

        // After processing the links, add the following code for logging
        const executionTime = (Date.now() - startTime) / 1000;

        // Write program execution information to the log file
        logContent += `Program execution time: ${executionTime} seconds\n`;
        logContent += `Total Number Apps in Marketplace Today: ${allAppLinks.length}\n`
        logContent += `Total Number of Errors in Program Run: ${errorCount}\n`;
        logContent += `Apps Links that didn't load on First Pass: ${retryFailedLinks.join(' ')}\n`;
        logContent += `Total Number of Links that didn't load on second pass: ${linksFailedToLoad.length}\n`;
        logContent += `Apps Links that didn't load on Second Pass: ${linksFailedToLoad.join(' ')}\n`;
        logContent += '===============================\n';

        // write to logs to file
        fs.appendFileSync(logsFilePath, logContent);

        const transporter = nodemailer.createTransport({
            service: 'gmail', auth: {
                user: process.env.SENDER_EMAIL,
                pass: process.env.PASSWORD
            }
        });

        const mailOptions = {
            from: process.env.SENDER_EMAIL,
            to: process.env.RECIPIENT_EMAIL,
            subject: `Log Content ${currentDate}`,
            text: logContent
        };

        await transporter.sendMail(mailOptions, function (error) {
            if (error) {
                console.log(error);
            } else {
                console.log('Email sent!\n');
            }
        });

        async function processLink(url) {
            try {
                console.log("Loading Page...");
                // Set the navigation timeout directly in the page.goto options
                await page.goto(url, {timeout: 60000}); // Increase the timeout value to 60000ms (60 seconds)
                await page.waitForSelector('.css-legcjp', {timeout: 60000});

                // Get the HTML content of the page
                const htmlContent = await page.content();
                const pageTitle = await page.title();

                let regex = /[^a-zA-Z0-9]/g;

                // Replace non-alphanumeric characters with an empty string
                let app_path = pageTitle.replace(regex, '');

                // Create a unique filename based on the current date and time
                const filename = file_path_prefix + `${currentDate}/site-snapshots/${app_path}_${currentDate}.html`;

                // uses fspromise to aysncronously write to the file
                await fspromise.writeFile(filename, htmlContent);

                console.log("Page Loaded!");

                const user_requirements = await page.$$eval('.css-16lkeer', (elements) => {
                    return elements.map((element) => element.textContent);
                });

                const scopes = await page.$$eval('.css-cmr47g', (elements) => {
                    return elements.map((element) => element.textContent);
                });
                await page.$$eval('.MuiLink-root', (elements) => {
                    return elements.map((element) => element.textContent);
                });


                const viewInformationElements = await page.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('.css-d0uhtl'));
                    // Define a recursive function to check ancestors for the inner text
                    const hasParentWithText = (element, text) => {
                        if (!element || element.textContent.includes("App can manage information")) {
                            return false;
                        }

                        if (element.textContent.includes(text)) {
                            return true;
                        }

                        return hasParentWithText(element.parentElement, text);
                    };

                    return elements
                        .filter(element => {
                            // Check if any ancestor up to the root contains the inner text
                            return hasParentWithText(element.parentElement, 'App can view information');
                        })
                        .map(element => element.textContent.trim());
                });

                const manageInformationElements = await page.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('.css-d0uhtl'));

                    // Define a recursive function to check ancestors for the inner text
                    const hasParentWithText = (element, text) => {
                        if (!element || element.textContent.includes("App can view information")) {
                            return false;
                        }

                        if (element.textContent.includes(text)) {
                            return true;
                        }

                        return hasParentWithText(element.parentElement, text);
                    };

                    return elements
                        .filter(element => {
                            // Check if any ancestor up to the root contains the inner text
                            return hasParentWithText(element.parentElement, 'App can manage information');
                        })
                        .map(element => element.textContent.trim());
                });

                const linksToFind = ['Developer Documentation', 'Developer Privacy Policy', 'Developer Support', 'Developer Terms of Use',];

                const hrefs = {};

                for (const linkText of linksToFind) {
                    const href = await page.evaluate((text) => {
                        const links = document.querySelectorAll('.MuiLink-root');
                        for (const link of links) {
                            if (link.textContent === text) {
                                return link.getAttribute('href');
                            }
                        }
                        return null;
                    }, linkText);

                    hrefs[linkText] = href;
                }

                // Create a JSON object for the current link
                const item = {
                    appName: pageTitle,
                    appUrl: url,
                    scopes: scopes,
                    userRequirements: user_requirements,
                    viewPermissions: viewInformationElements,
                    managePermissions: manageInformationElements,
                    developerDocumentation: hrefs['Developer Documentation'],
                    developerPrivacyPolicy: hrefs['Developer Privacy Policy'],
                    developerSupport: hrefs['Developer Support'],
                    developerTermsOfUse: hrefs['Developer Terms of Use']
                };

                lineNumber++;

                console.log(`Line ${lineNumber} - Items:`, item, 'Error Count: ', errorCount);

                itemsArray.push(item);
            } catch (error) {
                const logsFilePath = file_path_prefix + `${currentDate}/logs/logs.txt`;
                console.error(`Timeout waiting for URL: ${url}`);
                errorCount++;
                linksFailedToLoad.push(url); // Add to failed links array
                fs.appendFileSync(logsFilePath, `Failed to app page: ${url}\n`); // Log the failure
            }
        }

        // Close the browser at the end of program execution
        await browser.close();

        compressFolder();

        function compressFolder() {
            const folderName = 'site-snapshots';
            const zipFilePath = path.join(file_path_prefix, `${currentDate}/`, `${folderName}/`);

            process.chdir(`${file_path_prefix}${currentDate}/`);

            // Zip the folder
            exec(`zip -r site-snapshots.zip site-snapshots/`, (error, stdout, stderr) => {
                if (error) {
                    console.error(`Error compressing folder: ${error}`);
                    return;
                }

                // Remove the folder after successful compression
                exec(`rm -rf site-snapshots`, (rmError, rmStdout, rmStderr) => {
                    if (rmError) {
                        console.error(`Error deleting folder: ${rmError}`);
                    } else {
                        console.log(`Folder deleted successfully: ${zipFilePath}`);
                    }
                });

                console.log(`Folder compressed successfully: ${zipFilePath}`);
            });
        }


    });
})();
