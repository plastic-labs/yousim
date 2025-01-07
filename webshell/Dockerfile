# Use an official Node runtime as the base image
FROM node:18

# Set the working directory in the container
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package.json and package-lock.json (if available)
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# Copy project files and folders to the current working directory (i.e. 'app' folder)
COPY . .

# Use development server
EXPOSE 3000
CMD ["pnpm", "run", "dev", "--host"]
