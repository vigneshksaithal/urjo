import { mount } from 'svelte'
import './app.css'
import PreviewApp from './PreviewApp.svelte'

const appElement = document.getElementById('app')
if (!appElement) {
    throw new Error('App element not found')
}

export const app = mount(PreviewApp, {
    target: appElement
})
