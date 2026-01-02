FROM node:20-bookworm

# Instalar LaTeX y dependencias
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

# Copiar archivos de dependencias
# Nota: Si usas package-lock.json asegúrate de que esté en el repo
COPY package*.json tsconfig.json ./
RUN npm install

# Copiar el resto del código
COPY . .

# Compilar TypeScript (esto genera la carpeta /dist)
RUN npm run build

ENV PORT=4000
EXPOSE 4000

# IMPORTANTE: Asegúrate de que en package.json "start" sea "node dist/server.js"
# O usa directamente el comando aquí:
CMD ["node", "dist/server.js"]
