# Strict Fibonacci Heap Visualizer

An interactive web-based visualization tool for understanding and experimenting with Strict Fibonacci Heaps (SFH). A practical educational resource for exploring this advanced data structure through interactive visualization.

> **Live Demo**: <https://xsuty.github.io/sfh-vis/>

## Features

- 🎯 **Interactive Operations**: Insert, delete minimum, decrease key, delete node, and meld heaps
- 📚 **Step-by-Step Execution**: Visualize algorithm steps to understand the internal mechanics
- 🌳 **Multiple Heaps**: Work with multiple heaps simultaneously and merge them together
- 📊 **Dynamic Visualization**: Real-time graph rendering with Cytoscape and a custom tidy-tree layout
- 🎚️ **List View Controls**: Height slider for list rows and collapsible list sections for clean navigation
- 🧭 **Interactive Explore Mode**: In advanced mode, right-clicking a node locks inspect mode; left-clicking collapsed section nodes in lists view expands that section
- 🔬 **Advanced Mode**: Detailed operation information for deeper learning
- 💾 **Data Persistence**: Export and import heap states as JSON
- 🛠️ **Developer Tools**: ESLint, stylelint, and HTMLHint for code quality

## Quick Start

### Prerequisites

- **Node.js** v18+ and **npm** v9+
- A modern web browser (Chrome, Firefox, Safari, Edge)

### Option 1: Run Locally (Recommended for Development)

1. **Clone the repository**:

   ```bash
   git clone https://github.com/xsuty/sfh-vis.git
   cd sfh-vis
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Start a local web server**:

   **With npm** (Recommended):

   ```bash
   npm run dev
   ```

   **Or with Node.js**:

   ```bash
   npx http-server
   ```

   **Or with Python 3**:

   ```bash
   python -m http.server 8000
   ```

4. **Open in browser**: Navigate to the address shown by your web server output

   - `npm run dev` and `npx http-server` typically use `http://localhost:8080`
   - `python -m http.server 8000` uses `http://localhost:8000`

> **Important**: The application uses ES6 modules which require a web server. Opening `index.html` directly in the browser will not work.

### Option 2: Use the Online Demo

Visit <https://xsuty.github.io/sfh-vis/> - no installation needed!

## Usage Guide

### Operations

#### Insert a Value

1. Enter a number in the input field at the top
2. Click the **"Insert"** button
3. Watch the heap update in real-time

#### Delete Minimum

- Click **"Delete-min"** to remove the smallest element
- Observe the restructuring operation in the visualization

#### Decrease Key

1. Click on a node in the heap visualization
2. In the modal, enter a new (smaller) key value
3. Click **"Update Key"** to apply the change

#### Delete a Node

1. Click on a node in the heap visualization
2. In the modal, click **"Delete"** in the "Delete Node" section
3. The node will be removed from the heap

#### Meld Heaps

1. Create multiple heaps using **"+ New Heap"**
2. Click **"Meld Heaps"** to combine two heaps
3. Select which heaps to merge

#### Step Through Operations

- Use **"Next step"** to advance through internal operations
- Click **"Skip steps"** to complete the current operation instantly
- Useful for understanding how operations work internally

#### Multiple Heaps

- Use heap tabs at the top to switch between different heaps
- You can create up to **5 heaps** at once
- Click **"Delete Heap"** to remove a heap (at least one must remain)

### Advanced Features

**Advanced View**: Toggle the checkbox in the header to reveal detailed operation information and internal state

**Export/Import Heap**:

- Click **"Export Heap"** to download the current heap state as JSON
- Use **"Import Heap"** to restore a previously saved state
- Useful for sharing specific heap configurations or testing

**Status Bar**: Watch the status display for the current app mode (idle, stepping, or merge selection). Detailed step progression appears in the Step Log.

## Project Structure

```text
sfh-visualizer/
├── .github/
│   └── appmod/             # App modernization generated artifacts
├── .gitignore              # Git ignore rules
├── .htmlhintrc             # HTMLHint configuration
├── .nvmrc                  # Recommended Node.js major version
├── .stylelintrc.json       # stylelint configuration
├── index.html              # Main application entry point
├── package.json            # Project metadata and dependencies
├── package-lock.json       # Locked dependency versions
├── LICENSE                 # MIT License
├── README.md               # This file
├── eslint.config.mjs       # ESLint configuration
├── css/
│   └── styles.css          # Application styling
├── js/
│   ├── app.js              # Main Vue 3 application component
│   ├── app-state.js        # Centralized state management
│   ├── constants.js        # Application constants
│   ├── cy-styles.js        # Cytoscape styling
│   ├── rendering.js        # Cytoscape graph rendering
│   ├── heap.js             # Strict Fibonacci Heap implementation
│   ├── heap-manager.js     # Heap operation orchestration
│   ├── ui-computed.js      # Computed UI properties
│   ├── steps-manager.js    # Step-by-step execution logic
│   ├── heap.failure.json   # Debug fixture for heap invariants
│   ├── heap.failure.import.json # Debug fixture for import flow
│   └── heap.tests.js       # Comprehensive unit tests
```

## Development

### Setup for Contributors

1. Follow the "Quick Start" section above
2. All dependencies are listed in `package.json` as dev dependencies

### Available Commands

```bash
# Testing
npm run test:heap          # Run the comprehensive heap implementation tests

# Code Formatting
npm run format:js          # Format JavaScript files
npm run format:css         # Format CSS files
npm run format:html        # Format HTML files
npm run format             # Run all formatters

# Code Linting
npm run lint:js            # Lint + auto-fix JavaScript files
npm run lint:css           # Lint + auto-fix CSS files
npm run lint:html          # Validate HTML
npm run lint               # Run all linters and validators
```

## Technologies

- **Vue.js 3**: Progressive JavaScript framework for the UI
- **Cytoscape.js**: Graph visualization and analysis
- **Custom tree layout**: Tidy subtree-aware positioning for heap visualization
- **ESLint**: JavaScript code quality and style
- **stylelint**: CSS code quality
- **HTMLHint**: HTML validation
- **Node.js**: Runtime for development tools

## Browser Compatibility

This application works in all modern browsers supporting:

- ES6+ JavaScript (ES2015+)
- CSS Grid and Flexbox
- HTML5

Tested on:

- Chrome (desktop & android)
- Opera
- Firefox
- Edge

## Troubleshooting

### "Module not found" or "CORS error"

- **Cause**: Running the app without a web server
- **Solution**: Use one of the methods in the "Quick Start" section to run a local web server

### Heap operations not responding

- **Cause**: JavaScript module loading issue
- **Solution**: Clear browser cache (Ctrl+F5 or Cmd+Shift+R) and reload the page

### Linting/formatting commands fail

- **Cause**: Node.js/npm not properly installed or PATH not set
- **Solution**: Reinstall Node.js from <https://nodejs.org> and then run `npm install` again in the project directory

## Contributing

Contributions are welcome! The project is designed for educational purposes and improvements to the visualization, algorithm implementation, or documentation are appreciated.

### Did you find a bug?

Please open an issue on GitHub with:

- A clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your browser and OS information

### Do you want to improve the code?

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/improvement`)
3. Make your changes
4. Run `npm run lint` to check code quality
5. Run `npm run test:heap` to verify heap behavior
6. Stage and commit with clear messages (`git add . && git commit -m 'Add feature'`)
7. Push to your fork
8. Create a Pull Request with a description of your changes

## References

This implementation visualizes the **Strict Fibonacci Heaps** data structure introduced by:

> Brodal, G. S., Lagogiannis, G., & Tarjan, R. E. (2025). "Strict Fibonacci Heaps." *ACM Transactions on Algorithms*, 21(2), 15. <https://doi.org/10.1145/3707692>

### Why Strict Fibonacci Heaps matter

- **Worst-case time complexity**: O(1) for decrease-key (unlike standard Fibonacci heaps)
- **Practical efficiency**: Competitive with standard Fibonacci heaps while providing stronger guarantees
- **Educational value**: Understanding this structure helps grasp advanced data structure design

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

## About

This project was developed as part of a **Bachelor's thesis** at the [Faculty of Informatics](https://www.muni.cz/en) of Masaryk University in Brno, Czech Republic.

The visualizer serves as an **educational tool** to help students and researchers understand:

- The internal structure of Strict Fibonacci Heaps
- How operations maintain heap properties
- The mechanisms that achieve optimal worst-case complexity
- Algorithm visualization as a learning method

## Citation

If you use this visualizer in academic work, please cite:

```bibtex
@misc{sfh-visualizer,
  author = {Štefan Šutý},
  title = {Strict Fibonacci Heap Visualizer},
  year = {2026},
  url = {https://github.com/xsuty/sfh-vis}
}
```

---

**Questions or feedback?** Feel free to open an issue or contact us through GitHub.
