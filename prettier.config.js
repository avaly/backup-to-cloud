module.exports = {
	bracketSpacing: true,
	printWidth: 100,
	semi: true,
	singleQuote: true,
	trailingComma: 'all',
	useTabs: true,
	overrides: [
		{
			files: ['package.json', 'package-lock.json'],
			options: {
				tabWidth: 2,
				useTabs: false,
			},
		},
	],
};
