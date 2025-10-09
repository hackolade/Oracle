/**
 * @typedef {Function} Execute
 */

const _ = require('lodash');

/**
 * Generates a SQL query to retrieve synonym information using ALL_* tables.
 * This approach is used as a fallback for users who don't have access to DBA_* tables.
 * Works for most Oracle users who have standard access privileges.
 *
 * @param {string} schema - The Oracle schema name to query synonyms from
 * @returns {string} SQL query string for retrieving synonyms from ALL_* tables
 */
const getSynonymsQueryUsingAllTables = schema => {
	return `
		SELECT ALL_SYNONYMS.OWNER,
		    ALL_SYNONYMS.SYNONYM_NAME,
		    ALL_SYNONYMS.TABLE_NAME,
		    ALL_OBJECTS.EDITIONABLE
		  FROM ALL_SYNONYMS
		  LEFT JOIN ALL_OBJECTS
		    ON ALL_OBJECTS.OWNER = ALL_SYNONYMS.OWNER
		    AND ALL_OBJECTS.OBJECT_NAME = ALL_SYNONYMS.SYNONYM_NAME
		  WHERE ORIGIN_CON_ID > 1 AND ALL_SYNONYMS.TABLE_OWNER = '${schema}'
	`;
};

/**
 * Generates a SQL query to retrieve synonym information using DBA_* tables.
 * This is the preferred approach as it provides richer results and access to all synonyms
 * in the database. Requires SELECT_CATALOG_ROLE or equivalent privileges.
 *
 * @param {string} schema - The Oracle schema name to query synonyms from
 * @returns {string} SQL query string for retrieving synonyms from DBA_* tables
 */
const getSynonymsQueryUsingDbaTables = schema => {
	return `
		SELECT DBA_SYNONYMS.OWNER,
		    DBA_SYNONYMS.SYNONYM_NAME,
		    DBA_SYNONYMS.TABLE_NAME,
		    DBA_OBJECTS.EDITIONABLE
		  FROM DBA_SYNONYMS
		  LEFT JOIN DBA_OBJECTS
		    ON DBA_OBJECTS.OWNER = DBA_SYNONYMS.OWNER
		    AND DBA_OBJECTS.OBJECT_NAME = DBA_SYNONYMS.SYNONYM_NAME
		  WHERE ORIGIN_CON_ID > 1 AND DBA_SYNONYMS.TABLE_OWNER = '${schema}'
	`;
};

/**
 * Retrieves synonyms from an Oracle schema with automatic fallback capability.
 *
 * This function implements a two-tier approach:
 * 1. First attempts to use DBA_* tables (for users with SELECT_CATALOG_ROLE - provides richer results)
 * 2. Falls back to ALL_* tables if DBA_* fails or returns empty results (standard approach for most users)
 *
 * The function filters out synonyms that are not actually used in the schema (referenced in DDL scripts).
 *
 * @param {{ schema: string, execute: Execute, logger: object, allDDLs: string }} params
 * @param {string} params.schema - The Oracle schema name to retrieve synonyms from
 * @param {Execute} params.execute - Database execution function for running SQL queries
 * @param {object} params.logger - Logger instance for tracking progress and errors
 * @param {string} params.allDDLs - All DDL scripts from the schema used to filter synonyms that are actually used
 * @returns {Promise<Array>} Promise that resolves to an array of synonym objects
 */
const getSchemaSynonymDtos = async ({ schema, allDDLs, execute, logger }) => {
	try {
		logger.log('info', { message: 'Start getting synonyms' }, 'Getting synonyms');

		let queryResult;
		let queryApproach = 'DBA_* tables';
		let shouldTryAllFallback = false;

		try {
			const dbaTablesQuery = getSynonymsQueryUsingDbaTables(schema);
			queryResult = await execute(dbaTablesQuery);

			if (!queryResult || queryResult.length === 0) {
				shouldTryAllFallback = true;
			}
		} catch (dbaTablesError) {
			logger.log(
				'info',
				{
					message: 'DBA_* tables approach failed with exception, trying ALL_* tables fallback',
					error: dbaTablesError.message,
				},
				'Getting synonyms',
			);
			shouldTryAllFallback = true;
		}

		if (shouldTryAllFallback) {
			logger.log('info', { message: 'Trying ALL_* tables approach as fallback' }, 'Getting synonyms');
			queryApproach = 'ALL_* tables';

			try {
				const allTablesQuery = getSynonymsQueryUsingAllTables(schema);
				queryResult = await execute(allTablesQuery);
			} catch (allTablesError) {
				logger.log(
					'info',
					{ message: 'ALL_* tables approach also failed, using empty result', error: allTablesError.message },
					'Getting synonyms',
				);
				queryResult = [];
			}
		}

		logger.log(
			'info',
			{
				message: `Finish getting synonyms using ${queryApproach}`,
				count: queryResult?.length || 0,
				queryApproach,
			},
			'Getting synonyms',
		);

		if (_.isEmpty(queryResult)) {
			return [];
		}

		const synonyms = queryResult.map(([owner, synonymName, synonymEntityId, editionable]) => {
			return {
				synonymPublic: owner === 'PUBLIC',
				synonymName,
				synonymEntityId,
				synonymEditionable: editionable === null || editionable === 'N' ? 'NONEDITIONABLE' : 'EDITIONABLE',
			};
		});

		return filterUsedSynonyms({ synonyms, allDDLs });
	} catch (err) {
		logger.log(
			'error',
			{
				message: 'Cannot get synonyms',
				error: { message: err.message, stack: err.stack, err: _.omit(err, ['message', 'stack']) },
			},
			'Getting synonyms',
		);
		return [];
	}
};

/**
 * @param {{ execute: Execute }}
 * @returns {({ schema, logger }: { schema: string, allDDLs: string, logger: object }) => Promise<Array>}
 */
const getSchemaSynonyms =
	({ execute }) =>
	async ({ schema, allDDLs, logger }) => {
		return await getSchemaSynonymDtos({ schema, allDDLs, execute, logger });
	};

/**
 * Filters synonyms to only include those that are actually used in the provided DDL scripts.
 *
 * @param {{ synonyms: Array<{ synonymName: string }>, allDDLs: string }} params
 * @param {Array<{ synonymName: string }>} params.synonyms - Array of synonym objects to filter
 * @param {string} params.allDDLs - All DDL scripts from the schema to search for synonym usage
 * @returns {Array} Array of synonyms that are actually used in the DDL scripts
 */
const filterUsedSynonyms = ({ synonyms, allDDLs }) => {
	const usedSynonyms = [];

	for (const synonym of synonyms) {
		const synonymRegexp = new RegExp('\\b' + synonym.synonymName + '\\b', 'i');

		if (synonymRegexp.test(allDDLs)) {
			usedSynonyms.push(synonym);
		}
	}

	return usedSynonyms;
};

module.exports = {
	getSchemaSynonyms,
};
