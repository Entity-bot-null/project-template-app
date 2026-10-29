// Calls a control endpoint of the e2e proxy (scripts/e2e-proxy.mjs, in front
// of the real API) from a flow: failures on demand. Maestro runs it on the
// machine that runs the flows, where the proxy listens; a call that does not
// succeed fails the flow.
//
//   - runScript:
//       file: ../scripts/e2e-proxy.js
//       env:
//         CONTROL: faults                # faults, faults/clear, sessions/expire, sessions/revoke
//         ROUTE: POST /api/auth/sign-in  # faults only: the route, and the status it
//         STATUS: '429'                  # answers with (0: no answer at all)
//
// The proxy on another address: maestro test -e E2E_PROXY_URL=http://localhost:<port> .maestro

const base = typeof E2E_PROXY_URL === 'undefined' ? 'http://localhost:4010' : E2E_PROXY_URL;
const fault = typeof ROUTE === 'undefined' ? {} : { route: ROUTE, status: Number(STATUS) };

const response = http.post(base + '/__e2e/' + CONTROL, {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(fault),
});
if (!(response.status >= 200 && response.status < 300)) {
  throw new Error('E2E proxy ' + CONTROL + ': HTTP ' + response.status + ' ' + response.body);
}
