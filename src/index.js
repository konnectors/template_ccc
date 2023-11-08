import { ContentScript } from 'cozy-clisk/dist/contentscript'
import Minilog from '@cozy/minilog'
const log = Minilog('ContentScript')
Minilog.enable()

class TemplateContentScript extends ContentScript {
  async ensureAuthenticated() {
    return true
  }

  async ensureNotAuthenticated() {
    return true
  }

  async getUserDataFromWebsite() {
    return {
      sourceAccountIdentifier: 'defaultTemplateSourceAccountIdentifier'
    }
  }

  async fetch(context) {
    this.log('info', '🤖 fetch')
    await this.goto('https://file-examples.com')
    await this.waitForElementInWorker(`a[href='#features']`)
    const files = Array.from({ length: 10 }, (_, i) => ({
      filename: 'testfile' + i + '.jpg',
      fileurl:
        'https://file-examples.com/storage/fe9d743740654a8139a48e1/2017/10/file_example_JPG_500kB.jpg'
    }))

    await this.saveFiles(files, {
      contentType: 'image/jpeg',
      fileIdAttributes: ['filename'],
      context
    })
  }
}

const connector = new TemplateContentScript()
connector.init().catch(err => {
  log.warn(err)
})
