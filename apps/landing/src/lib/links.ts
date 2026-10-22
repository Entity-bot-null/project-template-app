// The app's links live under this path of the site (the links of the API's
// emails: APP_ORIGIN + APP_BASE_PATH + the screen, #token=… in the fragment).
// The phone opens them in the app, which claims them through the files the
// web image serves under /.well-known/; anywhere else the web image answers
// them with the open-in-app page (apps/landing/nginx/default.conf.template).
export const APP_LINKS_PATH = '/app/';
