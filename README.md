# CTM Phone Embed Demo

Example Node.js Application to connect to CallTrackingMetrics embeddable softphone into your application.

  * You can either use our component's UI or build your own
  * Authentication is handled automatically via backend connection

To run the example web application you will need to ensure the following environment variables are set

```
export CTM_TOKEN='ctm-api-key'
export CTM_SECRET='ctm-api-secret'
export CTM_ACCOUNT_ID='ctm-account-id'
export CTM_HOST='app.calltrackingmetrics.com'
```

In bash you can do this with:
```
export CTM_SECRET=your_actual_auth_token_here
```
windows command prompt:
```
set CTM_SECRET=your_actual_auth_token_here
```
and windows powershell:
```
$env:CTM_SECRET="your_actual_auth_token_here"
```

# certs
``` bash
brew install mkcert
mkcert -install
mkcert localhost
```

# Building
```
npm install
```

# Running
```
npm run dev
```

# CTM Access API
To enable single sign-on with CTM the application sends a request to the CTM Access API to get a token.
This token is then used to authenticate the user with the CTM API.
The token is valid for 5 minutes and can be used to authenticate the user with the CTM API.

# Also see this about embedding
https://app.calltrackingmetrics.com/phoneapp/embed_example

# Notes
* direnv can be your friend: https://direnv
