import { ContentScript } from 'cozy-clisk/dist/contentscript'
import Minilog from '@cozy/minilog'
const log = Minilog('ContentScript')
Minilog.enable('BooksToScrapeCCC')

// URLS

// As mentionned in the documentation, booksToScrape does not have any login logic
// To illustrate this part, we're gonne use a automation testing website that have one.
const loginSuccessfullUrl =
  'https://practicetestautomation.com/logged-in-successfully/'
const homePageUrl = 'https://books.toscrape.com/'

// ELEMENTS

const connectedElementSelector =
  'a[href="https://practicetestautomation.com/practice-test-login/"]'
const usernameInputSelector = '#username'
const passwordInputSelector = '#password'

class BookToScrapeContentScript extends ContentScript {
  async onWorkerEvent({ event, payload }) {
    if (event === 'loginSubmit') {
      const { login, password } = payload || {}
      // If both had been intercepted correctly, we're saving them in the store to save them on the device after the cozy account creation
      if (login && password) {
        this.log('info', 'Credentials successfully intercepted')
        this.store.userCredentials = { login, password }
      }
    }
  }

  async onWorkerReady() {
    function addClickListener() {
      document.body.addEventListener('click', e => {
        const clickedElementId = e.target.getAttribute('id')
        if (clickedElementId === 'submit') {
          const login = document.querySelector(usernameInputSelector)?.value
          const password = document.querySelector(passwordInputSelector)?.value
          this.bridge.emit('workerEvent', {
            event: 'loginSubmit',
            payload: { login, password }
          })
        }
      })
    }
    await this.waitForDomReady()
    // We're adding the listener only if we are on the loginForm, no need to watch for other pages
    if (
      (await this.checkForElement(usernameInputSelector)) &&
      (await this.checkForElement(passwordInputSelector))
    ) {
      this.log('info', 'Adding the click listener on the submit button')
      addClickListener.bind(this)()
    }
  }

  async ensureAuthenticated({ account }) {
    this.log('info', '🤖 ensureAuthenticated')
    // This listen to the worker events, to be able to monitor and act on events like DOM changes, errors on the website or credentials submitting for example
    this.bridge.addEventListener('workerEvent', this.onWorkerEvent.bind(this))
    const credentials = await this.getCredentials()
    if (!account || !credentials) {
      await this.ensureNotAuthenticated()
    }
    await this.showLoginFormAndWaitForAuthentication()
    this.log('info', 'ensureAuthenticated - Login successfull !')
    return true
  }

  async ensureNotAuthenticated() {
    this.log('info', '🤖 ensureNotAuthenticated')
    // To test the path where no logout is required, just change the selector to loginFormUrl
    await this.goto(loginSuccessfullUrl)
    // Waiting for elements indicating we're connected or not
    await this.waitForElementInWorker(
      `${usernameInputSelector}, ${connectedElementSelector}`
    )
    const authenticated = await this.runInWorker('checkAuthenticated')
    if (!authenticated) {
      this.log('info', 'ensureNotAuthenticated - User is already disconnected')
      return true
    }
    await this.runInWorker(
      'click',
      'a[href="https://practicetestautomation.com/practice-test-login/"]'
    )
    await this.waitForElementInWorker(usernameInputSelector)
    this.log('info', 'ensureNotAuthenticated - User has been disconnected')
    return true
  }

  async showLoginFormAndWaitForAuthentication() {
    this.log('info', '🤖 showLoginFormAndWaitForAuthentication')
    // Make the webview visible to the user so he can interact with the website
    await this.setWorkerState({ visible: true })
    // This function will launch your "checkAuthenticated" repeatedly until it return true, meaning the user has logged in.
    await this.runInWorkerUntilTrue({
      method: 'waitForAuthenticated'
    })
    // Once authenticated, the webview is hidden from the user.
    await this.setWorkerState({ visible: false })
  }

  async checkAuthenticated() {
    return Boolean(document.querySelector(connectedElementSelector))
  }

  async getUserDataFromWebsite() {
    this.log('info', '🤖 getUserDataFromWebsite')
    // Check if there are some saved credentials
    const credentials = await this.getCredentials()
    const credentialsLogin = credentials?.login
    // Check if we manage to intercept the used login
    const storeLogin = this.store?.userCredentials?.login
    // Prefer intercepted credentials over scraped data since the user could need his email to log in
    // but once done, the website may expose username or an ID.
    let sourceAccountIdentifier = credentialsLogin || storeLogin
    // If for some reasons, none of them is available, we may need to scrape it on the website anyway
    if (!sourceAccountIdentifier) {
      sourceAccountIdentifier = await this.runInWorker('findValidSAI')
    }
    // sourceAccountIdentifier is mandatory.
    // It will be the name of the cozy account and the name directory where the files are saved.
    if (!sourceAccountIdentifier) {
      throw new Error('Could not get a sourceAccountIdentifier')
    }
    return {
      sourceAccountIdentifier: sourceAccountIdentifier
    }
  }

  async fetch(context) {
    this.log('info', '🤖 fetch')
    // Check if credentials are presents in the store and save them if applicable.
    if (this.store.userCredentials != undefined) {
      await this.saveCredentials(this.store.userCredentials)
    }
    // Navigate to the products page
    await this.goto(homePageUrl)
    // Wait for product cards to appear on the page, confirming the page is ready to be scraped.
    await this.waitForElementInWorker('.product_pod')
    // For this example, we will get the products from two pages only, just to show how to work with pagination
    // Get the number of pages available
    const numberOfPages = await this.runInWorker('getNumberOfPages')
    this.log('info', `numberOfPages : ${numberOfPages}`)
    let page = 1
    const filesToSave = []
    // Get in a loop as long as we have pages to scrape. You would use "numberOfPage" instead of "limit" in a real sceanrio.
    while (page < numberOfPages) {
      const files = await this.runInWorker('getFiles')
      filesToSave.push(...files)
      await this.navigateToNextPage(page + 1)
      page++
      this.log('info', `page end of loop : ${page}`)
    }
    // Save the retrieved files to the cozy instance
    await this.saveFiles(filesToSave, {
      context,
      fileIdAttributes: ['vendorRef'],
      contentType: 'image/jpeg'
    })

    //At this point we will navigate to the user infoPage, but as the website used for the example does not have any we'll just show how to build an identity for cozy
    const userIdentity = await this.runInWorker('getUserIdentity')
    // Save the fetched identity in "contact" key of an object, it is mandatory.
    await this.saveIdentity({ contact: userIdentity })
  }

  async navigateToNextPage(targetedPage) {
    this.log('info', '📍️ navigateToNextPage starts')
    await this.goto(
      `https://books.toscrape.com/catalogue/page-${targetedPage}.html`
    )
    // Once the element had reappeared, navigation is complete.
    await this.waitForElementInWorker(
      `a[href*="page-${targetedPage + 1}.html"]`
    )
    this.log('info', `navigation to page ${targetedPage} completed`)
  }

  async findValidSAI() {
    this.log('info', '📍️ findValidSAI starts')
    // As we are on a practice website, there is no specific user logged in the end.
    // To get a scraping example we will scrape "student" to be the sourceAcountIdentifier as it is the username to use to log in.
    const usernameElementContent = document.querySelector('strong').textContent
    const validSAI = usernameElementContent.split('.')[0].split(' ')[1].trim()
    return validSAI
  }

  async getNumberOfPages() {
    this.log('info', '📍️ getNumberOfPages starts')
    // This is one way to retrieve the number of pages for this website (50 at the moment)
    const foundNumber = Number(
      document.querySelector('.current').textContent.trim().split('of ')[1]
    )
    this.log('info', `Found ${foundNumber} pages`)
    // But we're setting a limit of 3 pages for this example to avoid scraping all 50 pages
    return 3
  }

  async getFiles() {
    this.log('info', '📍️ getFiles starts')
    const productCards = document.querySelectorAll('.product_pod')
    const pageFiles = []
    for (const productCard of productCards) {
      const product = {
        amount: normalizePrice(
          productCard.querySelector('.price_color')?.innerHTML
        ),
        date: '2025-01-01',
        vendor: 'bookstoscrape',
        filename: productCard.querySelector('h3 a')?.getAttribute('title'),
        fileurl:
          'https://books.toscrape.com/' +
          productCard.querySelector('img')?.getAttribute('src'),
        // Usually vendorRef will be the ID of the files given by the website
        // For this example we will just use the source attribute of the product's image.
        vendorRef: productCard.querySelector('img')?.getAttribute('src')
      }
      pageFiles.push(product)
    }
    return pageFiles
  }

  async getUserIdentity () {
    this.log('info', '📍️ getUserIdentity starts')
    const identity = {
      email: ['john.doe@email.com'],
      name: {
        fullName: 'John Doe',
        givenName: 'John',
        lastName: 'Doe'
      },
      address: [
        {
          formattedAddress: "1 rue des papillons 99999 Devcity",
          street: "1 rue des papillons",
          postCode: "99999",
          city: "Devcity"
        }
      ],
      phone:[
        {
          type: 'home',
          number: "0423156789"
        },
        {
          type: 'mobile',
          number: "0623451789"
        }
      ]
    }
    return identity
  }
}

// Convert a price string to a float
function normalizePrice(price) {
  return parseFloat(price.replace('£', '').trim())
}

const connector = new BookToScrapeContentScript()
connector
  .init({
    additionalExposedMethodsNames: [
      'findValidSAI',
      'getNumberOfPages',
      'getFiles',
      'getUserIdentity'
    ]
  })
  .catch(err => {
    log.warn(err)
  })
