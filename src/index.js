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

class BookToScrapeContentScript extends ContentScript {
  onWorkerReady() {
  }

  onWorkerEvent({ event, payload }) {
  }

  async ensureAuthenticated({ account }) {
    this.log('info', '🤖 ensureAuthenticated')
    const credentials = await this.getCredentials()
    if (!account || !credentials) {
      await this.ensureNotAuthenticated()
    }
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
    await this.setWorkerState({ visible: true })
    await this.runInWorkerUntilTrue({
      method: 'waitForAuthenticated'
    })
    await this.setWorkerState({ visible: false })
  }

  async checkAuthenticated() {
    return Boolean(document.querySelector(connectedElementSelector))
  }

  async getUserDataFromWebsite() {
    this.log('info', '🤖 getUserDataFromWebsite')
  }

  async fetch(context) {
    this.log('info', '🤖 fetch')
  }

}

const connector = new BookToScrapeContentScript()
connector
  .init({ additionalExposedMethodsNames: [] })
  .catch(err => {
    log.warn(err)
  })
