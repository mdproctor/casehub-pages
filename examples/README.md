# casehub-pages Examples Gallery

A web application that showcases casehub-pages examples in an interactive gallery.

## Features

- Browse all examples organized by category
- Search examples by name or category
- View examples in an embedded casehub-pages viewer
- Open examples in new windows
- Reload examples on demand
- Responsive design with collapsible categories

## Prerequisites

Before building the examples gallery, you need to build the main casehub-pages webapp:

```bash
# From the repository root
yarn install
yarn build
```

This will create the compiled casehub-pages webapp in `webapp/dist/`.

## Building the Examples Gallery

```bash
# Install dependencies
yarn install

# Build the gallery
yarn  build
```

This will:
1. Generate `samples.json` with metadata about all examples
2. Copy the built casehub-pages webapp from `../webapp/dist/`
3. Copy all sample files and supporting data
4. Copy the HTML/CSS/JS files for the gallery interface

The final output will be in the `dist/` directory.

## Running the Gallery

### Development Mode (with Hot Reload)

For active example development with automatic reload on file changes:

```bash
yarn dev
```

This will:
- Start a development server at http://localhost:8080
- Watch all sample YAML files in `samples/`
- Automatically rebuild `samples.json` when examples change
- Live reload the browser when changes are detected
- Open the gallery in your default browser

Just edit any `.dash.yaml` file and see changes instantly.

The BrowserSync UI (for advanced control) is available at http://localhost:8081

### Production Mode

For serving the built gallery without file watching:

```bash
yarn serve
```

This will start a local web server at http://localhost:8080 and open it in your browser.

## Development

The gallery consists of:

- **`src/index.html`** - Main HTML structure
- **`src/styles.css`** - Styling for the gallery interface
- **`src/app.js`** - JavaScript application logic
- **`scripts/`** - Build scripts
  - `generate-samples.js` - Scans examples and creates samples.json
  - `copy-melviz.js` - Copies the built casehub-pages webapp
  - `copy-samples.js` - Copies samples and supporting files

## Project Structure

```
examples/
├── samples/             # Example YAML files organized by category
├── src/                 # Source files for the gallery
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── scripts/             # Build scripts
├── dist/                # Built gallery (generated)
├── samples.json         # Example metadata (generated)
├── package.json
└── README.md
```

## Adding New Examples

Simply add new `.dash.yaml` or `.yml` files to the `samples/` directory. They will be automatically discovered when you run `npm run build`.

The file structure in `samples/` will determine the category organization in the gallery.

## License

Apache-2.0
