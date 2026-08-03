const scalableLength = /(?<![\w-])(?:\d*\.)?\d+px\b/g;

function scaleFontLengths(value) {
  if (!value.includes("px") || value.includes("--ui-font-scale")) return value;
  return value.replace(
    scalableLength,
    (length) => `calc(${length} * var(--ui-font-scale, 1))`,
  );
}

export default function fontScalePlugin() {
  return {
    postcssPlugin: "shuzhi-runtime-font-scale",
    Declaration(declaration) {
      if (declaration.prop === "font-size" || declaration.prop === "font") {
        declaration.value = scaleFontLengths(declaration.value);
      }
    },
  };
}

fontScalePlugin.postcss = true;
