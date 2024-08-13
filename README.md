# YouSim

YouSim is a simulator that lets you simulate identities within the latent space
of Claude 3.5 Sonnet.

## Getting Started

Fill out the .env file.
```bash
cp .env.template .env
```

Build the docker image and run the container.
```bash
docker build -t yousim .
docker run -p 8000:8000 yousim
```