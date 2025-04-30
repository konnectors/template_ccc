import { ContentScript } from 'cozy-clisk/dist/contentscript'
import Minilog from '@cozy/minilog'
const log = Minilog('ContentScript')
Minilog.enable('BooksToScrapeCCC')

// URLS

// As mentionned in the documentation, booksToScrape does not have any login logic
// To illustrate this part, we're gonne use a automation testing website that have one.
const loginFormUrl = "https://practicetestautomation.com/practice-test-login/"
const loginSuccessfullUrl = "https://practicetestautomation.com/logged-in-successfully/"
const homePageUrl = "https://books.toscrape.com/"

// ELEMENTS

const connectedElementSelector = 'a[href="https://practicetestautomation.com/practice-test-login/"]'
const usernameInputSelector = "#username"
const passwordInputSelector = "#password"
const submitButtonSelector = "#submit"

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
          const login = document.querySelector(
            usernameInputSelector
          )?.value
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
      this.log(
        'info',
        'Adding the click listener on the submit button'
      )
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
    await this.waitForElementInWorker(`${usernameInputSelector}, ${connectedElementSelector}`)
    const authenticated = await this.runInWorker('checkAuthenticated')
    if(!authenticated){
      this.log('info', 'ensureNotAuthenticated - User is already disconnected')
      return true
    }
    await this.runInWorker('click', 'a[href="https://practicetestautomation.com/practice-test-login/"]')
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
  }

  async findValidSAI () {
    this.log('info', '📍️ findValidSAI starts')
    // As we are on a practice website, there is no specific user logged in the end.
    // To get a scraping example we will scrape "student" to be the sourceAcountIdentifier as it is the username to use to log in.
    const usernameElementContent = document.querySelector('strong').textContent
    const validSAI = usernameElementContent.split('.')[0].split(' ')[1].trim()
    return validSAI
  }

}

const connector = new BookToScrapeContentScript()
connector
  .init({ additionalExposedMethodsNames: ['findValidSAI'] })
  .catch(err => {
    log.warn(err)
  })
