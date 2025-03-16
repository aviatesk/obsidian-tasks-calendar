module.exports = [
	{
		// Files to lint
		files: ["**/*.{js,jsx,ts,tsx}"],
		// Files to ignore
		ignores: [
			"node_modules/",
			"main.js"
		],
		languageOptions: {
			parser: require("@typescript-eslint/parser"), // updated to use parser module object
			ecmaVersion: "latest",
			sourceType: "module",
			parserOptions: { // moved ecmaFeatures here
				ecmaFeatures: { jsx: true }
			},
			globals: {
				// browser globals
				window: "readonly",
				document: "readonly",
				navigator: "readonly",
				// node globals
				require: "readonly",
				process: "readonly",
				__dirname: "readonly",
				__filename: "readonly"
			}
		},
		plugins: {
			"@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
			"react": require("eslint-plugin-react"),
			"react-hooks": require("eslint-plugin-react-hooks")
		},
		settings: {
			react: { version: "detect" }
		},
		rules: {
			// "no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": ["error", { args: "none" }],
			"@typescript-eslint/ban-ts-comment": "off",
			"no-prototype-builtins": "off",
			"@typescript-eslint/no-empty-function": "off",
			"react/react-in-jsx-scope": "off"
		}
	}
];
