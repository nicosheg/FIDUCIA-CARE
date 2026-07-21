FROM node:18-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    chromium \
    libatk-bridge2.0-0 \
    libxkbcommon-x11-0 \
    libgtk-3-0 \
    libgbm-dev \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Tell Git to always use HTTPS instead of SSH
RUN git config --global url."https://github.com/".insteadOf "git@github.com:"

COPY package.json .
RUN npm install
COPY . .

RUN mkdir -p /data/session && chmod 777 /data/session

EXPOSE 3001
CMD ["npm", "start"]
