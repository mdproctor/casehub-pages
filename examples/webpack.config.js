const path = require("path");
const commonConfig = require("@casehubio/pages-webpack-base/webpack.common.config");

module.exports = (env = {}) => {
  const common = commonConfig({ dev: !!env.dev });

  // Filter out the importsNotUsedAsValues option injected by webpack-base
  // in dev mode — removed in TypeScript 5.x (replaced by verbatimModuleSyntax)
  const rules = (common.module?.rules || []).map((rule) => {
    if (rule && rule.test && rule.test.toString() === "/\\.tsx?$/") {
      return {
        ...rule,
        use: (rule.use || []).map((loader) => {
          if (loader && loader.loader && loader.options?.compilerOptions?.importsNotUsedAsValues !== undefined) {
            const { importsNotUsedAsValues, ...restCompilerOptions } = loader.options.compilerOptions;
            return {
              ...loader,
              options: {
                ...loader.options,
                compilerOptions: restCompilerOptions,
              },
            };
          }
          return loader;
        }),
      };
    }
    return rule;
  });

  return {
    ...common,
    module: {
      ...common.module,
      rules: [
        ...rules.map((rule) => {
          if (rule && rule.test && rule.test.toString() === '/\\.css$/') {
            return { ...rule, resourceQuery: { not: [/raw/] } };
          }
          return rule;
        }),
        {
          test: /\.css$/,
          resourceQuery: /raw/,
          type: 'asset/source',
        },
        {
          test: /pages-ui-components[\/]dist[\/]/,
          sideEffects: true,
        },
        {
          test: /graph-renderer[\/]dist[\/]/,
          sideEffects: true,
        },
        {
          test: /pages-property-palette[\/]dist[\/]/,
          sideEffects: true,
        },
        {
          test: /pages-diagram-palette[\/]dist[\/]/,
          sideEffects: true,
        },
        {
          test: /pages-code-editor[\/]dist[\/]/,
          sideEffects: true,
        },
      ],
    },
    entry: {
      "casehub-bundle": path.resolve(__dirname, "src/casehub-entry.ts"),
      "diagram-export-tool": path.resolve(__dirname, "src/diagram-export-tool.ts"),
    },
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "[name].js",
      library: {
        name: "casehubPages",
        type: "umd",
      },
      globalObject: "this",
    },
    devServer: {
      port: 8080,
      proxy: [
        {
          context: ["/api/", "/ws/"],
          target: "http://localhost:8090",
          ws: true,
          changeOrigin: true,
        },
      ],
      historyApiFallback: true,
    },
    resolve: {
      ...common.resolve,
      alias: {
        "@casehubio/pages-runtime": path.resolve(__dirname, "../packages/pages-runtime"),
        "@casehubio/pages-viz": path.resolve(__dirname, "../packages/pages-viz"),
        "@casehubio/pages-ui": path.resolve(__dirname, "../packages/pages-ui"),
        "@casehubio/pages-component": path.resolve(__dirname, "../packages/pages-component"),
        "@casehubio/pages-data": path.resolve(__dirname, "../packages/pages-data"),
        "@casehubio/pages-primitives": path.resolve(__dirname, "../packages/pages-primitives"),
        "@casehubio/pages-ui-tokens": path.resolve(__dirname, "../packages/pages-ui-tokens"),
        "@casehubio/pages-aria/dist/controller": path.resolve(__dirname, "../packages/pages-aria/dist/controller.js"),
        "@casehubio/pages-table": path.resolve(__dirname, "../packages/pages-table"),
        "@casehubio/pages-ui-components/input": path.resolve(__dirname, "../packages/pages-ui-components/dist/input"),
        "@casehubio/pages-ui-components/select": path.resolve(__dirname, "../packages/pages-ui-components/dist/select"),
        "@casehubio/pages-ui-components/textarea": path.resolve(__dirname, "../packages/pages-ui-components/dist/textarea"),
        "@casehubio/pages-ui-components/checkbox": path.resolve(__dirname, "../packages/pages-ui-components/dist/checkbox"),
        "@casehubio/pages-ui-components/button": path.resolve(__dirname, "../packages/pages-ui-components/dist/button"),
        "@casehubio/pages-ui-components/badge": path.resolve(__dirname, "../packages/pages-ui-components/dist/badge"),
        "@casehubio/pages-ui-components/status-dot": path.resolve(__dirname, "../packages/pages-ui-components/dist/status-dot"),
        "@casehubio/pages-ui-components/number-input": path.resolve(__dirname, "../packages/pages-ui-components/dist/number-input"),
        "@casehubio/pages-ui-components/date-input": path.resolve(__dirname, "../packages/pages-ui-components/dist/date-input"),
        "@casehubio/pages-ui-components/datetime-input": path.resolve(__dirname, "../packages/pages-ui-components/dist/datetime-input"),
        "@casehubio/pages-ui-components/color-swatch": path.resolve(__dirname, "../packages/pages-ui-components/dist/color-swatch"),
        "@casehubio/pages-ui-components/slider": path.resolve(__dirname, "../packages/pages-ui-components/dist/slider"),
        "@casehubio/pages-ui-components/tag-editor": path.resolve(__dirname, "../packages/pages-ui-components/dist/tag-editor"),
        "@casehubio/pages-ui-components/duration-input": path.resolve(__dirname, "../packages/pages-ui-components/dist/duration-input"),
        "@casehubio/pages-ui-components/validation": path.resolve(__dirname, "../packages/pages-ui-components/dist/validation"),
        "@casehubio/pages-ui-components/types": path.resolve(__dirname, "../packages/pages-ui-components/dist/types"),
        "@casehubio/pages-ui-components": path.resolve(__dirname, "../packages/pages-ui-components"),
        "@casehubio/pages-code-editor": path.resolve(__dirname, "../packages/pages-code-editor"),
        "@casehubio/pages-schema": path.resolve(__dirname, "../packages/pages-schema"),
        "@casehubio/graph-core": path.resolve(__dirname, "../packages/graph-core"),
        "@casehubio/graph-renderer": path.resolve(__dirname, "../packages/graph-renderer"),
        "@casehubio/pages-property-palette": path.resolve(__dirname, "../packages/pages-property-palette"),
        "@xyflow/react/dist/style.css": path.resolve(__dirname, "../packages/graph-renderer/node_modules/@xyflow/react/dist/style.css"),
      },
    },
  };
};
