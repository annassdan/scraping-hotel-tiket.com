const CONSOLE_RED = '\x1b[31m';
const CONSOLE_GREEN = '\x1b[32m';
const CONSOLE_YELLOW = '\x1b[33m';
const CONSOLE_MAGENTA = '\x1b[35m';
const CONSOLE_CYAN = '\x1b[36m';
const CONSOLE_BLUE = '\x1b[34m';
const CONSOLE_WHITE = '\x1b[37m';
const WAIT_UNTIL = 'networkidle0';

console.log(CONSOLE_CYAN, 'Start Import Modules......');
console.log(CONSOLE_CYAN, '=============================================================================================================');
const { performance } = require('perf_hooks');
const chalk = require('chalk');
const jsdom = require("jsdom");
const fs = require('fs');
const {JSDOM} = jsdom;
const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;


/**
 * Delay function
 * @param ms
 * @returns {Promise<unknown>}
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const sleep = require('system-sleep');


const regions = [
    {
        region: 'Jawa%20Barat',
        jsonSelector: 'JabarHotelsOnTiketDotCom'
    },
    {
        region: 'Jawa%20Timur',
        jsonSelector: 'JatimHotelsOnTiketDotCom'
    },
    {
        region: 'Jawa%20Tengah',
        jsonSelector: 'JatengHotelsOnTiketDotCom'
    },
    {
        region: 'Jakarta',
        jsonSelector: 'JakartaHotelsOnTiketDotCom'
    },
    {
        region: 'Provinsi%20Yogyakarta',
        jsonSelector: 'JogjaHotelsOnTiketDotCom'
    }
];

const TEMP_RESULT_JSON = 'temp-result.json';
const STOPPED_JSON = 'stopped.json';
const host = `https://www.tiket.com`;
const urlPrefix = `${host}/hotel/search?room=1&adult=1&id=east-java-108001534490276152&type=REGION&q=`;
const urlSuffix = `&checkin=2021-06-22&checkout=2021-06-23&sort=popularity&page=`;
const region = regions[1];
const url = urlPrefix + region.region + urlSuffix;
let eachRegionResults = [];

(async () => {

    let stopped = {};
    try {
        // handle if error in process before done
        const tempResult = fs.readFileSync(TEMP_RESULT_JSON);
        const temp = tempResult ? JSON.parse(tempResult) : [];
        eachRegionResults = temp ? [...temp] : [];

        const stoppedAt = fs.readFileSync(STOPPED_JSON);
        stopped = stoppedAt ? JSON.parse(stoppedAt) : {};
    } catch (e) {}


    console.log(CONSOLE_RED, '-  Opening Chrome Browser...');
    const browser = await puppeteer.launch({
        headless: false
    });

    console.log(CONSOLE_BLUE, '1. Create New Page...');
    const page = await browser.newPage();

    let startIndexx = stopped ? (stopped['page'] || 1) : 1;
    let startKey = stopped ? (stopped['dataIndex'] || 0) : 0;
    let startPropertyTotal = stopped ? (stopped['propertyTotal'] || 1) : 1;

    console.log(CONSOLE_BLUE, '2. Opening Tiket.com...');
    await page.goto(`${url}${startIndexx}`, {
        waitUntil: WAIT_UNTIL,
        timeout: 0
    });
    console.log(CONSOLE_MAGENTA, '   -- Tiket.com on page 1 loaded.');

    let loadedPage = await page.content();
    let dom = await new JSDOM(loadedPage);
    let doc = dom.window.document;
    const paginationSelector = doc.querySelector('.pagination');
    const paginationLinkSelectors = paginationSelector.querySelectorAll('a');

    console.log(CONSOLE_MAGENTA, '   -- Counting how many page result...');
    const indexxEnd = Number(paginationLinkSelectors[paginationLinkSelectors.length - 2].textContent);
    // const indexxEnd = 1;

    const startCollecting = performance.now();
    let propertyTotal = startPropertyTotal;


    const createCheckPoint = async (indexx, key) => {
        // creating log error, so can restart program from last evaluation
        const stoppedOn = { page: indexx, dataIndex: key, propertyTotal };
        await fs.writeFile(STOPPED_JSON, JSON.stringify(stoppedOn), err => {});
        await fs.writeFile(TEMP_RESULT_JSON, JSON.stringify(eachRegionResults), err => {});
        // ========================================================================================
    }

    let breaking = false;

    for (let indexx = startIndexx; indexx <= indexxEnd; indexx++) {
        if (breaking) break;

        console.log(CONSOLE_GREEN, `   $$ Evaluate page ${indexx} of ${indexxEnd}.`);

        if (indexx > startIndexx) {
            await page.goto(`${url}${indexx}`, {
                waitUntil: WAIT_UNTIL,
                timeout: 0
            });
            console.log(CONSOLE_MAGENTA, `   -- Tiket.com on page ${indexx} loaded.`);

            loadedPage = await page.content();
            dom = await new JSDOM(loadedPage);
            doc = dom.window.document;
            startKey = 0;
        }

        // create checkpoint
        if (indexx > 1 && indexx % 5 === 0) {
            createCheckPoint(indexx, startKey).then();
        }

        const wrappedResults = doc.querySelectorAll('.hotel-card');
        for (let key = startKey; key < wrappedResults.length; key++) {
            const startTime = performance.now();
            // if (propertyTotal === 11) {
            //     breaking = true;
            //     break;
            // }
            try {
                const value = wrappedResults[key];

                let hotelName = value.querySelectorAll('.title.ellipsis')[0]?.innerHTML;
                hotelName = hotelName.replace('&amp;', '&');
                console.log(CONSOLE_YELLOW, `      (${propertyTotal}) @Hotel \"${hotelName}\". Please wait extracting $data...`);

                // extract hotel url on tiket.com
                const hotelUrlOnTiketDotCom = `${host}${value.querySelector('a')?.getAttribute('href')}`;

                const hotelInfoPage = await browser.newPage();
                await hotelInfoPage.goto(hotelUrlOnTiketDotCom, {
                    waitUntil: WAIT_UNTIL,
                    timeout: 0
                });

                const hotelPageLoaded = await hotelInfoPage.content();
                const hotelDom = await new JSDOM(hotelPageLoaded);
                const docHotel = hotelDom.window.document;

                const hotelRegionDom = docHotel.querySelector('.breadcrumb');
                const hotelBreadcrumbLocations = hotelRegionDom?.querySelectorAll('a');
                const hotelRegion = hotelBreadcrumbLocations[1]?.textContent;
                const hotelCity = hotelBreadcrumbLocations[2]?.textContent;
                const hotelSpecificLocation = hotelBreadcrumbLocations[3]?.textContent;
                const hotelDescriptionSelectorsContainer = docHotel.querySelectorAll('.collapsible.text-collapse.hidden.expand');
                const hotelDescriptionParagraphs = hotelDescriptionSelectorsContainer[0]?.querySelectorAll('p');
                const descriptions = [];
                hotelDescriptionParagraphs?.forEach(d => descriptions.push(d.textContent));
                const hotelDescriptions = descriptions.join(' ');

                const hotelReviewerTotal = docHotel.querySelector('.review-badge-count')?.textContent;
                const hotelAddressOnMaps = docHotel.querySelector('.location-address')?.textContent;

                const hotelFacilitiesSelectors = docHotel.querySelectorAll('.facility-label');
                const facilities = [];
                hotelFacilitiesSelectors?.forEach(facility => facilities.push(facility.textContent));
                const hotelFacilities = facilities.join(', ');

                // detail review
                const reviewCardTiketSelector = docHotel.querySelectorAll('.review-card.tiket');
                const reviewCardTiketTypeSelectors = reviewCardTiketSelector[0]?.querySelectorAll('.title.ellipsis');
                const reviewCardTiketScoreSelectors = reviewCardTiketSelector[0]?.querySelectorAll('.score');
                const reviewCardTiket = [];
                reviewCardTiketTypeSelectors?.forEach((r, u) => {
                    const rev = `${r.textContent}=${reviewCardTiketScoreSelectors[u]?.textContent}/5`;
                    reviewCardTiket.push(rev);
                });
                const reviewDetail = reviewCardTiket.join(', ');

                // traveler type
                const travellersCardType = docHotel.querySelectorAll('.review-card.purpose-traveller.tiket');
                const travellerTypeSelectors = travellersCardType[0]?.querySelectorAll('.label');
                const travellerTotalSelectors = travellersCardType[0]?.querySelectorAll('.score');
                const travellers = [];
                travellerTypeSelectors?.forEach((t, u) => {
                    const trv = `${t.textContent} terdapat ${travellerTotalSelectors[u]?.textContent}`;
                    travellers.push(trv);
                });
                const estimatedTravellersType = travellers.join(', ');

                await hotelInfoPage.close();

                // Search hotel on maps
                let hotelPhone = '';
                let hotelSite = '';
                const mapsPage = await browser.newPage();
                await mapsPage.goto(`https://www.google.co.id/maps/place/${hotelName}`, {
                    waitUntil: WAIT_UNTIL,
                    timeout: 0
                });

                await mapsPage.click('button#searchbox-searchbutton');
                await delay(4000);

                const mapsPageLoaded = await mapsPage.content();
                const mapsDom = await new JSDOM(mapsPageLoaded);
                const docMaps = mapsDom.window.document;

                // get all available buttons
                const buttons = docMaps.querySelectorAll('button');

                // comparison param
                const phoneParamId = 'Telepon:';
                const phoneParamEn = 'Phone:';
                const websiteParamId = 'Situs Web:';
                const websiteParamEn = 'Website:';

                buttons.forEach((v, k) => {
                    const ariaLabel = v.getAttribute('aria-label');
                    if (String(ariaLabel).includes(phoneParamId) || String(ariaLabel).includes(phoneParamEn)) {
                        hotelPhone = String(ariaLabel).replace(`${phoneParamId} `, '').replace(`${phoneParamEn} `, '');
                    }

                    if (String(ariaLabel).includes(websiteParamId) || String(ariaLabel).includes(websiteParamEn)) {
                        hotelSite = String(ariaLabel).replace(`${websiteParamId} `, '').replace(`${websiteParamEn} `, '');
                    }
                });
                await mapsPage.close();

                const hotelLocation = value.querySelectorAll('.location.ellipsis')[0]?.innerHTML;
                const hotelRating = `${value.querySelector('.tiket-rating')?.innerHTML}/5`;
                const hotelImpression = value.querySelector('.tiket-impression')?.innerHTML;
                const hotelStar = value.querySelector('.star-wrap')?.childNodes?.length;
                const hotelCurrentPricePerNight = value.querySelector('.after-price')?.textContent;

                // hotelUrlOnTiketDotCom
                let hotel = {
                    hotelName, hotelDescriptions, hotelLocation,
                    hotelRegion, hotelCity, hotelSpecificLocation,
                    hotelAddressOnMaps,
                    hotelRating, hotelReviewerTotal, hotelImpression, hotelStar,
                    hotelFacilities,
                    hotelPhone, hotelSite,
                    hotelCurrentPricePerNight: hotelCurrentPricePerNight || '',
                    reviewDetail, estimatedTravellersType
                };

                const completeIn = `Extracted complete in ${String(((performance.now() - startTime) / 1000).toFixed(2))}s`;
                console.log(CONSOLE_WHITE, `      ~ Page ${indexx}/${indexxEnd} --> ${key + 1}. ${key < 9 ? ' ' : ''}@Hotel \"${hotelName}\". 
                          ${hotelPhone?.trim() ? ('Phone: ') + hotelPhone.trim() : ''}
                          ${hotelSite?.trim() ? ('Website: ') + hotelSite.trim() : ''}
                          ${hotelAddressOnMaps}
                          @${hotelRegion} in ${hotelCity} at ${hotelSpecificLocation}. ${chalk.underline('More...')} `);
                console.log(CONSOLE_GREEN, `                         ${chalk.greenBright(completeIn)}`);

                // push hotel info
                eachRegionResults.push(hotel);
                propertyTotal++;
            } catch (e) {
                createCheckPoint(indexx, key).then();

                console.log(CONSOLE_RED, `Got error`);
                await delay(1800000);
            }
        }

        startIndexx = 1;
    }

    const minutes = ((performance.now() - startCollecting) / 60000);
    const collectedIn = ( minutes / 60);
    const collectedTime = `${collectedIn.toFixed(2)} hours (${minutes.toFixed(2)} minutes)`;
    console.log(CONSOLE_MAGENTA, `   -- Data was collected successfully in ${chalk.greenBright(collectedTime)}`);

    console.log(CONSOLE_BLUE, `3. Writing data results into CSV file > ${region.jsonSelector}.csv`);
    const csvWriter = createCsvWriter({
        path: `${region.jsonSelector}.csv`,
        header: [
            {id: 'hotelName', title: 'hotelName'},
            {id: 'hotelDescriptions', title: 'hotelDescriptions'},
            {id: 'hotelLocation', title: 'hotelLocation'},
            {id: 'hotelRegion', title: 'hotelRegion'},
            {id: 'hotelCity', title: 'hotelCity'},
            {id: 'hotelSpecificLocation', title: 'hotelSpecificLocation'},
            {id: 'hotelAddressOnMaps', title: 'hotelAddressOnMaps'},
            {id: 'hotelRating', title: 'hotelRating'},
            {id: 'hotelReviewerTotal', title: 'hotelReviewerTotal'},
            {id: 'hotelImpression', title: 'hotelImpression'},
            {id: 'hotelStar', title: 'hotelStar'},
            {id: 'hotelFacilities', title: 'hotelFacilities'},
            {id: 'hotelPhone', title: 'hotelPhone'},
            {id: 'hotelSite', title: 'hotelSite'},
            {id: 'hotelCurrentPricePerNight', title: 'hotelCurrentPricePerNight'},
            {id: 'reviewDetail', title: 'reviewDetail'},
            {id: 'estimatedTravellersType', title: 'estimatedTravellersType'},
        ]
    });

    const startWriteCsv = performance.now();
    await csvWriter.writeRecords(eachRegionResults);
    console.log(CONSOLE_MAGENTA, `   $$ The CSV file was written successfully. ${chalk.greenBright(`Complete in ${((performance.now() - startWriteCsv) / 1000).toFixed(4)}s`)}`);

    // try to remove log error file
    try { fs.unlinkSync(TEMP_RESULT_JSON); } catch (e) {}
    try { fs.unlinkSync(STOPPED_JSON); } catch (e) {}
    // =========================

    console.log(CONSOLE_BLUE, '4. Closing chrome tab...');
    await page.close();

    // console.log(CONSOLE_RED, '-  Terminating application...');
    // setTimeout(() => process.exit(), 2000);
})();
