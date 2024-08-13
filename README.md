# YouSim

YouSim is a simulator that lets you simulate identities within the latent space
of Claude 3.5 Sonnet. It's live at [https://yousim.ai](https://yousim.ai)!

## Self-Hosting

The backend and frontend need to be run separately. To get started, configure your `.env` file.

Copy the `.env.template` file to `.env` and fill out the variables:
```bash
cp .env.template .env
```
`ANTHROPIC_API_KEY`: Anthropic API key
`HONCHO_ENV`: Default value in `.env.template` goes to the [Honcho](https://github.com/plastic-labs/honcho) demo server. You'd only change this if you were running Honcho locally
`HONCHO_APP_NAME`: This denotes your application on the Honcho demo server
`CLIENT_REGEX`: Use default value in `.env.template`
`JWT_SECRET`: This comes from your supabase project (more on that below)
`SECRET_KEY`: Generate this with `python generate_fernet_key.py` -- makes links shareable without revealing information

To run the backend, you can use poetry with fastapi or docker. 

### Poetry + FastAPI

Activate the poetry environment
```
poetry install
poetry shell
```

Run backend with fastapi 
```
fastapi dev app.py
```

### Docker

Build the docker image and run the container.
```bash
docker build -t yousim .
docker run --env-file .env -p 8000:8000 yousim
```

The frontend has a separate `.env` file in the webshell folder.
```bash
cp webshell/.env.template webshell/.env
```

`VITE_API_URL`: This should be the url of your backend
`VITE_SUPABASE_URL`: This comes from your supabase project
`VITE_SUPABASE_KEY`: This comes from your supabase project (public key!)


Yousim uses local storage by default but uses cookies as backup, clearing cookies might not reset everything so check your local storage on the browser to reset things.
When you're setting up your supabase project, be sure to enable anonymous sign ins and change the magic link email template to include the code:
```html
<h2>YouSim Login Code</h2>

<p>Use this code to login:</p>
<p>{{ .Token }}</p>
```
