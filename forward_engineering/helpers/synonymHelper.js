module.exports = ({ wrapInQuotes, templates, assignTemplates }) => {
	const generateSynonymCreateStatement = synonym => {
		return assignTemplates(templates.createSynonym, {
			name: wrapInQuotes(synonym.synonymName),
			orReplace: synonym.synonymOrReplace ? ' OR REPLACE' : '',
			editionable: synonym.synonymEditionable ? ' EDITIONABLE' : '',
			public: synonym.synonymPublic ? ' PUBLIC' : '',
			objectName: synonym.synonymEntityName,
		});
	};

	const generateSynonymStatements = (synonyms, synonymEntityName) => {
		if (!synonyms?.length) {
			return '';
		}

		return (
			'\n' +
			synonyms
				.map(synonym => {
					return generateSynonymCreateStatement({
						...synonym,
						synonymEntityName,
					});
				})
				.join('\n')
		);
	};
	return { generateSynonymStatements };
};
