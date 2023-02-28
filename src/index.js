import { ContentScript } from 'cozy-clisk/dist/contentscript'
import Minilog from '@cozy/minilog'
const log = Minilog('ContentScript')
Minilog.enable()

const getTime = startTime => ((Date.now() - startTime) * 0.001).toFixed(2)
const formatFromMs = ms => (ms * 0.001).toFixed(2)

const baseUrl = 'http://toscrape.com'
const defaultSelector = "a[href='http://quotes.toscrape.com']"
const loginLinkSelector = `[href='/login']`
const logoutLinkSelector = `[href='/logout']`
class TemplateContentScript extends ContentScript {
  async ensureAuthenticated() {
    const startTime = Date.now()
    this.log('debug', '🛡️ ensureAuthenticated START')
    await this.goto(baseUrl)
    this.log(
      'debug',
      `🛡️ ensureAuthenticated goto(baseUrl) DONE in ${(
        (Date.now() - startTime) *
        0.001
      ).toFixed(2)}s`
    )
    await this.waitForElementInWorker(defaultSelector)
    this.log(
      'debug',
      `🛡️ ensureAuthenticated waitForElementInWorker(defaultSelector) DONE in ${(
        (Date.now() - startTime) *
        0.001
      ).toFixed(2)}s`
    )
    await this.runInWorker('click', defaultSelector)
    this.log(
      'debug',
      `🛡️ ensureAuthenticated runInWorker(click, defaultSelector) DONE in ${(
        (Date.now() - startTime) *
        0.001
      ).toFixed(2)}s`
    )
    // wait for both logout or login link to be sure to check authentication when ready
    await Promise.race([
      this.waitForElementInWorker(loginLinkSelector),
      this.waitForElementInWorker(logoutLinkSelector)
    ])
    this.log(
      'debug',
      `🛡️ ensureAuthenticated Promise.race([this.waitForElementInWorker(loginLinkSelector),this.waitForElementInWorker(logoutLinkSelector)]) DONE in ${(
        (Date.now() - startTime) *
        0.001
      ).toFixed(2)}s`
    )

    const authenticated = await this.runInWorker('checkAuthenticated')
    this.log(
      'debug',
      `🛡️ ensureAuthenticated this.runInWorker(checkAuthenticated) DONE in ${(
        (Date.now() - startTime) *
        0.001
      ).toFixed(2)}s`
    )
    if (!authenticated) {
      this.log('info', 'Not authenticated')
      await this.showLoginFormAndWaitForAuthentication()
      this.log(
        'debug',
        `🛡️ ensureAuthenticated (if not authenticated) this.showLoginFormAndWaitForAuthentication() DONE in ${(
          (Date.now() - startTime) *
          0.001
        ).toFixed(2)}s`
      )
    }

    this.log(
      'debug',
      `🛡️ ensureAuthenticated END in ${(
        (Date.now() - startTime) *
        0.001
      ).toFixed(2)}s`
    )
    return true
  }

  async checkAuthenticated() {
    return Boolean(document.querySelector(logoutLinkSelector))
  }

  async showLoginFormAndWaitForAuthentication() {
    log.debug('showLoginFormAndWaitForAuthentication start')
    await this.clickAndWait(loginLinkSelector, '#username')
    await this.setWorkerState({ visible: true })
    await this.runInWorkerUntilTrue({
      method: 'waitForAuthenticated'
    })
    await this.setWorkerState({ visible: false })
  }

  async fetch(context) {
    const startTime = Date.now()
    this.log('debug', `📥 fetch() - START at 0s`)

    log.debug(context, 'fetch context')
    const bookLinkSelector = `[href*='books.toscrape.com']`
    const timer0 = Date.now()
    await this.goto(baseUrl + '/index.html')
    this.log(
      'debug',
      `📥 fetch() - await this.goto(baseUrl + '/index.html') - START at ${formatFromMs(
        timer0 - startTime
      )}s, DONE in ${getTime(timer0)}s`
    )
    const timer1 = Date.now()
    await this.waitForElementInWorker(bookLinkSelector)
    this.log(
      'debug',
      `📥 fetch() - await this.waitForElementInWorker(bookLinkSelector) - START at ${formatFromMs(
        timer1 - startTime
      )}s, DONE in ${getTime(timer1)}s`
    )
    const timer2 = Date.now()
    await this.clickAndWait(bookLinkSelector, '#promotions')
    this.log(
      'debug',
      `📥 fetch() - await this.clickAndWait(bookLinkSelector, '#promotions') - START at ${formatFromMs(
        timer2 - startTime
      )}s, DONE in ${getTime(timer2)}s`
    )
    const timer3 = Date.now()
    const bills = await this.runInWorker('parseBills')
    this.log(
      'debug',
      `📥 fetch() - await this.runInWorker('parseBills') - START at ${formatFromMs(
        timer3 - startTime
      )}s, DONE in ${getTime(timer3)}s`
    )

    const timer4 = Date.now()
    for (const bill of bills) {
      await this.saveFiles([bill], {
        contentType: 'image/jpeg',
        fileIdAttributes: ['filename'],
        context
      })
    }
    this.log(
      'debug',
      `📥 fetch() - await this.saveFiles([bill], {...}) - START at ${formatFromMs(
        timer4 - startTime
      )}s, DONE in ${getTime(timer4)}s`
    )
  }

  async getUserDataFromWebsite() {
    return {
      sourceAccountIdentifier: 'defaultTemplateSourceAccountIdentifier'
    }
  }

  async parseBills() {
    const articles = document.querySelectorAll('article')
    return Array.from(articles).map(article => ({
      amount: normalizePrice(article.querySelector('.price_color')?.innerHTML),
      filename: article.querySelector('h3 a')?.getAttribute('title'),
      fileurl:
        'https://books.toscrape.com/' +
        article.querySelector('img')?.getAttribute('src')
    }))
  }
}

// Convert a price string to a float
function normalizePrice(price) {
  return parseFloat(price.replace('£', '').trim())
}

const connector = new TemplateContentScript()
connector.init({ additionalExposedMethodsNames: ['parseBills'] }).catch(err => {
  log.warn(err)
})
