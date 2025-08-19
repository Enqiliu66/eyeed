FROM node:22-slim
LABEL "language"="nodejs"
WORKDIR /src
COPY . .
RUN npm install -g vercel && npm install
EXPOSE 8080
CMD ["npx", "vercel", "dev", "--listen", "8080"]
