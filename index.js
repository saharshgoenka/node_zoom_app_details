const puppeteer = require('puppeteer');
const fspromise = require('fs').promises; // Use fs.promises for async file operations

const delay = ms => new Promise(res => setTimeout(res, ms));
const fs = require('fs');
const {writeFile} = require("fs");
// test branch
(async () => {
    const currentDate = new Date().toISOString().split('T')[0].replace(/[^0-9]/g, '-');

    let errorCount = 0;
    const startTime = Date.now(); // Record the start time
    let lineNumber = 0; // Initialize the line number
    const browser = await puppeteer.launch({
        // executablePath: '/usr/bin/chromium-browser'

        // executablePath: 'path/to/your/chrome.exe'
    });
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(0);


    // Check if the directory exists, and create it if it doesn't
    if (!fs.existsSync(`${currentDate}/links/`)) {
        fs.mkdirSync(`${currentDate}/links/`, { recursive: true });
    }

    if (!fs.existsSync(`${currentDate}/app-data/`)) {
        fs.mkdirSync(`${currentDate}/app-data/`, { recursive: true });
    }

    if (!fs.existsSync(`${currentDate}/site-snapshots/`)) {
        fs.mkdirSync(`${currentDate}/site-snapshots/`, { recursive: true });
    }

    if (!fs.existsSync(`${currentDate}/logs/`)) {
        fs.mkdirSync(`${currentDate}/logs/`, { recursive: true });
    }

    let all_links = []

    const baseURL = 'https://marketplace.zoom.us';

    for (let i = 1; i < 2; i++) {
        // Navigate to the website
        await page.goto(`${baseURL}/apps?page=${i}`);

        // Get the page title
        const pageTitle = await page.title();

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
        links = links.map((link) => `${baseURL}${link}`);

        console.log(links);
        all_links = all_links.concat(links);
    }

    console.log('Links:', all_links);

    const filePath = `${currentDate}/links/links.txt`;

// Convert the array of links to a newline-separated string
    const linksString = all_links.join('\n');

// Write the links to the text file
    writeFile(filePath, linksString, (err) => {
        if (err) {
            console.error('Error writing to the file:', err);
        } else {
            console.log('Links have been written to', filePath);
        }
    });


    // Specify the path to the text file
    // const filePath = 'links.txt';
    // Get the current date and time as a formatted string
    console.log(currentDate)
    // Append the current date to the file name
    const outputFilePath = `${currentDate}/app-data/zoom_marketplace_${currentDate}.json`;

    // Read the links from the text file
    fs.readFile(filePath, 'utf8', async (err, data) => {
        if (err) {
            console.error('Error reading the file:', err);
            await browser.close();
            return;
        }
        const links = data.trim().split('\n');
        const itemsArray = [];


        for (let link of links) {
            const url = link;

            try {
                console.log("Loading Page...");
                // Set the navigation timeout directly in the page.goto options
                await page.goto(url, { timeout: 60000 }); // Increase the timeout value to 60000ms (60 seconds)
                await page.waitForSelector('.css-legcjp', {timeout: 60000});

                // Get the HTML content of the page
                const htmlContent = await page.content();
                const pageTitle = await page.title();

                // Create a unique filename based on the current date and time
                const filename = `${currentDate}/site-snapshots/${pageTitle}_${currentDate}.html`;

                // const screenshotBuffer = await page.screenshot();

                // Write the HTML content to a file
                await fspromise.writeFile(filename, htmlContent);

                console.log("Page Loaded!");
            } catch (error) {
                console.error(`Timeout waiting for URL: ${url}`);
                // errorCount++;
                continue; // Skip this URL and continue with the next one
            }


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
                //
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

            //
            // const manageInformationElements = await page.evaluate(() => {
            //     const elements = Array.from(document.querySelectorAll('.css-gyjl6 + .css-0 .css-d0uhtl'));
            //     return elements
            //         .filter(element => {
            //             const parent = element.closest('.MuiBox-root.css-gyjl6'); // Replace 'your-parent-selector' with the actual parent selector
            //             return parent && parent.parent && parent.parent.parent.parent.parent.parent.parent.parent.innerText.includes("App can manage information");
            //         })
            //         .map(element => element.textContent.trim());
            // });
// Log the information
//             console.log('View Information Elements:', viewInformationElements);
            // console.log('Manage Information Elements:', manageInformationElements);
            const linksToFind = [
                'Developer Documentation',
                'Developer Privacy Policy',
                'Developer Support',
                'Developer Terms of Use',
            ];

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

            const pageTitle = await page.title();

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

            // Increment the line number and include it in the log statement
            lineNumber++;
            // console.log(user_requirements);
            // console.log(scopes);
            console.log(`Line ${lineNumber} - Items:`, item, 'Error Count: ', errorCount);

            itemsArray.push(item);

            const waitTime = 5;
            console.log("Starting " + waitTime + " second wait:");
            for (let i = 1; i < (waitTime + 1); i++) {
                await delay(1000);
                process.stdout.write(i + " ");
            }
            console.log("\nCompleted waiting for " + waitTime + " seconds");
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
        const logsFilePath = `${currentDate}/logs/logs.txt`;
        const executionTime = (Date.now() - startTime) / 1000;

        // Write program execution information to the log file
        let logContent = `Program execution time: ${executionTime} seconds\n`;
        logContent += `Total Errors: ${errorCount}\n`;
        logContent += '===============================\n';

        fs.appendFileSync(logsFilePath, logContent);

        // Close the logs.txt file
        console.log('Error Count: ', errorCount);
        console.log('Program execution time:', executionTime, 'seconds');
        console.log('Logs have been written to', logsFilePath);


        await browser.close();
    });
//     wow
})();
