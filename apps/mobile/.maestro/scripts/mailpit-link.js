// Finds the newest link the API emailed to an address, in the local Mailpit
// (`pnpm services:up`; its web API on MAILPIT_URL), and hands it to the flow
// as output.link, rewritten to the e2e variant's scheme: the e2e build claims
// no https domain, and the token travels in the fragment either way
// (src/lib/links.ts). Nothing found yet (the API's outbox sends within a few
// seconds) leaves output.link unset, for the flow to look again.
//
//   - runScript:
//       file: ../scripts/mailpit-link.js
//       env:
//         TO: ${output.email}           # the address the message went to
//         SCREEN: confirm-sign-up       # the screen the link opens
//
// Mailpit on another address: maestro test -e MAILPIT_URL=http://localhost:<port> .maestro/stack

const base = typeof MAILPIT_URL === 'undefined' ? 'http://localhost:8045' : MAILPIT_URL;
const scheme = typeof SCHEME === 'undefined' ? 'templateapp-e2e' : SCHEME;

function get(path) {
  const response = http.get(base + path);
  if (response.status !== 200) {
    throw new Error('Mailpit ' + path + ': HTTP ' + response.status + ' ' + response.body);
  }
  return json(response.body);
}

const pattern = new RegExp('/' + SCREEN + '#token=([A-Za-z0-9_-]{43})');
const found = get('/api/v1/search?query=' + encodeURIComponent('to:"' + TO + '"'));
// Newest first: the link of an earlier message to the same address no longer works.
for (const message of found.messages) {
  const match = pattern.exec(get('/api/v1/message/' + message.ID).Text);
  if (match) {
    output.link = scheme + '://' + SCREEN + '#token=' + match[1];
    break;
  }
}
