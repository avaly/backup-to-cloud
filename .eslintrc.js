module.exports = {
	env: {
		es6: true,
		node: true
	},
	extends: 'eslint:recommended',
	parserOptions: {
		ecmaVersion: 8
	},
	rules: {
		indent: ['error', 'tab'],
		'linebreak-style': ['error', 'unix'],
		'no-console': ['off'],
		'no-else-return': ['error'],
		quotes: ['error', 'single'],
		semi: ['error', 'always']
	}
};
