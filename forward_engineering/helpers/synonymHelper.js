module.exports = ({ wrapInQuotes, templates, assignTemplates, getNamePrefixedWithSchemaName }) => {
	const generateSynonymCreateStatement = synonym => {
		const namePrefixedWithSchemaName = getNamePrefixedWithSchemaName(synonym.synonymName, synonym.schemaName);
		return assignTemplates(templates.createSynonym, {
			name: synonym.synonymPublic ? wrapInQuotes(synonym.synonymName) : namePrefixedWithSchemaName,
			orReplace: synonym.synonymOrReplace ? ' OR REPLACE' : '',
			editionable: synonym.synonymEditionable ? ' ' + synonym.synonymEditionable : '',
			public: synonym.synonymPublic ? ' PUBLIC' : '',
			objectName: synonym.synonymEntityName,
		});
	};

	const generateSynonymStatements = (synonyms, synonymEntityName, schemaName) => {
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
						schemaName,
					});
				})
				.join('\n')
		);
	};
	return { generateSynonymStatements };
};
