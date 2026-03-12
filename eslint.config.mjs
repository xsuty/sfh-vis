import js from "@eslint/js";
import globals from "globals";
import pluginVue from "eslint-plugin-vue";
import { defineConfig } from "eslint/config";

export default defineConfig([
  js.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs,vue}"],
    languageOptions: {
      globals: {
        ...globals.browser,
        Vue: "readonly",
        cytoscape: "readonly",
      },
    },
  },
  pluginVue.configs["flat/essential"],
]);
