import { ContentScript } from 'cozy-clisk/dist/contentscript'
import Minilog from '@cozy/minilog'
const log = Minilog('ContentScript')
Minilog.enable('BookToScrapeCCC')

class BookToScrapeContentScript extends ContentScript {
  onWorkerReady() {
  }

  onWorkerEvent({ event, payload }) {
  }

  async ensureAuthenticated({ account }) {
    this.log('info', '🤖 ensureAuthenticated')
  }

  async ensureNotAuthenticated() {
    this.log('info', '🤖 ensureNotAuthenticated')
  }

  async showLoginFormAndWaitForAuthentication() {
    this.log('info', '🤖 showLoginFormAndWaitForAuthentication')
    await this.setWorkerState({ visible: true })
    await this.runInWorkerUntilTrue({
      method: 'waitForAuthenticated'
    })
    await this.setWorkerState({ visible: false })
  }

  async checkAuthenticated() {}

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
