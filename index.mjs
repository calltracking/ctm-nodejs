import process from 'process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import fetch from 'node-fetch';

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import fastifyBasicAuth from '@fastify/basic-auth';
import fastifyCookie from '@fastify/cookie';

import fastifyFormbody from '@fastify/formbody';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class App {
  constructor() {
    this.ctm_host       = process.env.CTM_HOST;
    this.ctm_token      = process.env.CTM_TOKEN;
    this.ctm_secret     = process.env.CTM_SECRET;
    this.ctm_account_id = process.env.CTM_ACCOUNT_ID;

    const hasHttpsKey = fs.existsSync('./localhost-key.pem');

    this.fastify = Fastify({
      logger: true,
      ...(hasHttpsKey && {
        https: {
          key: fs.readFileSync('./localhost-key.pem'),
          cert: fs.readFileSync('./localhost.pem')
        }
      })
    });

  }

  loginPage(request, reply) {
    reply.view('login.ejs');
  }

  loginUser(request, reply) {
    const { username, password } = request.body;

    if (password === 'ctm-demo-123') {
      reply
        .setCookie('user_session', 'logged_in', {
          path: '/',
          secure: false, // use true in production with HTTPS
          httpOnly: true,
        })
        .setCookie('user_email', username, {
          path: '/',
          secure: false, // use true in production with HTTPS
          httpOnly: true,
        })
        .redirect('/');
    } else {
      reply.redirect('/login');
    }
  }


  indexPage(request, reply) {
    reply.view('index.ejs', { ctm_host: this.ctm_host });
  }

  // hosts the CTM device that carriers the voice call and connects to the CTM phone control interface.
  devicePage(request, reply) {
    reply.view('device.ejs', { ctm_host: this.ctm_host });
  }

  // hosts your application content and embeds the CTM phone control interface.
  phonePage(request, reply) {
    reply.view('phone.ejs', { ctm_host: this.ctm_host });
  }

  agentStatusPage(request, reply) {
    const email = request.cookies.user_email || 'demo@calltrackingmetrics.com'; // or get from session
    reply.view('agent_status.ejs', { ctm_host: this.ctm_host, email: email });
  }

  // Example: Simplified outbound-only dialer with custom UI
  dialerOnlyPage(request, reply) {
    reply.view('dialer_only.ejs', { ctm_host: this.ctm_host });
  }

  // get an access token from CTM to allow your users to authenticate with CTM.
  async ctmAccessRequest(request, reply) {
    const requestUrl = `https://${this.ctm_host}/api/v1/accounts/${this.ctm_account_id}/phone_access`;

    const email = request.cookies.user_email || 'demo@calltrackingmetrics.com';
    const sessionId = request.cookies.user_session || 'dummy_session_id'; // Get session_id from cookie or use a dummy value

    const nameParts = email.split('@')[0].split('.');
    const firstName = nameParts[0] || 'John';
    const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Doe';

    const requestData = {
      email,
      first_name: firstName,
      last_name: lastName,
      session_id: sessionId,
    };

    const base64Credentials = Buffer.from(`${this.ctm_token}:${this.ctm_secret}`).toString('base64');

    console.log("Requesting token from CTM...", requestData);

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${base64Credentials}`
      },
      body: JSON.stringify(requestData)
    });

    if (response.ok) {
      const responseData = await response.json();
      const enhancedResponseData = {
        status: responseData.status,
        token: responseData.token,
        valid_until: responseData.valid_until,
        sessionId: requestData.session_id,
        email: requestData.email,
        last_name: requestData.last_name,
        first_name: requestData.first_name,
      };

      reply.send(enhancedResponseData);
    } else {
      const errorMessage = await response.text();
      reply.status(500).send(`Error accessing the phone access service: ${errorMessage}`);
    }
  }

  bindRoutes() {
    this.fastify.get('/', this.indexPage.bind(this));
    this.fastify.get('/agent-status', this.agentStatusPage.bind(this));
    this.fastify.get('/device', this.devicePage.bind(this));
    this.fastify.get('/phone', this.phonePage.bind(this));
    this.fastify.get('/dialer-only', this.dialerOnlyPage.bind(this));
    this.fastify.get('/login', this.loginPage.bind(this));

    this.fastify.post('/login', this.loginUser.bind(this));


    // API endpoint
    this.fastify.post('/api/ctm_access', this.ctmAccessRequest.bind(this));

    this.fastify.all('/api/v1/*', async (request, reply) => {
      const token = request.headers.authorization?.replace('Bearer ', '') || '';
      const path = request.raw.url.replace(/^\/api\/v1/, '');

      console.log(`>>> Proxying ${path} with token: ${token}`);

      const response = await fetch(`https://bgraw3.ngrok.io/api/v1${path}`, {
        method: request.method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        // credentials: 'include',
      });

      const data = await response.text();
      reply.header('Content-Type', 'application/json').send(data);
    });
  }

  initFastify() {
    // Register @fastify/view with EJS
    this.fastify.register(fastifyView, {
      engine: {
        ejs
      },
      root: path.join(__dirname, 'views'),
      viewExt: 'ejs'
    });

    this.fastify.register(fastifyCookie);
    this.fastify.register(fastifyFormbody);

    // Serve static files
    this.fastify.register(fastifyStatic, {
      root: path.join(__dirname, 'public'),
    });

    // For demo purposes, we are using a hardcoded username and password, you would want to take care to
    // secure your application with a proper authentication mechanism and user management.
    // For production, you application accessible on the internet a multi-factor authentication is strongly encouraged.
    this.fastify.register(fastifyBasicAuth, {
      validate: (username, password, req, reply, done) => {
        if (username === 'demo@calltrackingmetrics.com' && password === 'ctm-demo-123') {
          done();
        } else {
          done(new Error('Invalid credentials'));
        }
      },
      authenticate: true,
      cookie: {
        secret: 'super_snecrets', // for cookies signature
      },
    });

    function shouldBypassAuth(url) {
      const bypassPatterns = [
        /^\/login$/,                 // Login page
        /^\/public\//,               // Static files
        /^\/api\//,                  // API endpoints
        // /^\/phoneapp\/assets\.json$/, // Special JSON asset
        /\.js$/,                     // JS files
        /\.css$/,                    // CSS files
        /\.json$/,                   // Other JSON files
        /\.map$/,                    // Source maps
      ];

      return bypassPatterns.some((pattern) => pattern.test(url));
    }

    // Middleware to check if user is authenticated
    this.fastify.addHook('preHandler', (request, reply, done) => {
      const url = request.raw.url;
      const isLoggedIn = request.cookies.user_session === 'logged_in';

      console.log(`>>> url: ${url}`);

      if (!isLoggedIn && !shouldBypassAuth(url)) {
        reply.redirect('/login');
      } else {
        done();
      }
    });
  }

  async start() {
    console.log('Starting...');
    this.initFastify();
    this.bindRoutes();
    try {
      await this.fastify.listen({
        port: 8001,
        host: 'localhost',
      });
    } catch (err) {
      this.fastify.log.error(err);
      process.exit(1);
    }
  }
}

const app = new App();

await app.start();
