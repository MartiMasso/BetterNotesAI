// lib/templates/index.ts

export const templates = [
  {
    id: "landscape_3col_maths",
    name: "Landscape 3 columns (Maths)",
    format: "latex",
    sourcePath: "lib/templates/latex/landscape_3col_maths.tex",
    publicPath: "/templates/landscape_3col_maths.tex",
    previewPath: "/templates/previews/3cols_landscape_Template_Calculus.pdf",
    thumbnailPath: "/templates/previews/3cols_landscape.png",
    description: "Compact 3-column landscape layout ideal for math formulas.",
  },
  {
    id: "2cols_portrait",
    name: "Portrait 2 columns (QFT/QED cheat-sheet)",
    format: "latex",
    sourcePath: "lib/templates/latex/2cols_portrait.tex",
    publicPath: "/templates/2cols_portrait.tex",
    previewPath: "/templates/previews/2cols_portrait_QED_For_Hadrons.pdf",
    thumbnailPath: "/templates/previews/2cols_portrait.png",
    description: "Classic 2-column portrait layout for physics summaries.",
  },
] as const;