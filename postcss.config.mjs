import tailwindcss from "@tailwindcss/postcss";
import fontScalePlugin from "./scripts/postcss-font-scale.mjs";

const config = {
  plugins: [tailwindcss(), fontScalePlugin()],
};

export default config;
