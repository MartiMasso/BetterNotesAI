FROM node:20-bookworm


RUN apt-get update && apt-get install -y --no-install-recommends \
    texlive-latex-base \
    texlive-latex-recommended \
    texlive-latex-extra \
    texlive-fonts-recommended \
    texlive-science \
    texlive-pictures \
    texlive-luatex \
    lmodern \
    latexmk \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

COPY templates ./templates

ENV PORT=4000

EXPOSE 4000

CMD ["npm", "start"]
