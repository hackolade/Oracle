/**
 * @typedef {Function} Execute
 * @typedef {{ [optionName: string]: string | number | undefined }} Options
 */

const { Sequence, SequenceDto } = require('../../forward_engineering/types/schemaSequenceTypes');
const mapLimit = require('async/mapLimit');

const START_VALUE_REGEX = /(?<=START WITH)(\s+)([\w]+)(?=\s+)?/;
const SHARING_LINK_REGEX = /\s+LINK$/;

/**
 * @enum {string}
 */
const OPTION_VALUE = {
	true: 'Y',
	false: 'N',
};

/**
 * @enum {string}
 */
const SEQUENCE_OPTION = {
	cache: 'cache',
	cycle: 'cycle',
	extend: 'extend',
	global: 'global',
	keep: 'keep',
	noCache: 'nocache',
	noCycle: 'nocycle',
	noExtend: 'noextend',
	noKeep: 'nokeep',
	noOrder: 'noorder',
	noScale: 'noscale',
	noShard: 'noshard',
	order: 'order',
	scale: 'scale',
	scaleExtend: 'scaleExtend',
	session: 'session',
	shard: 'shard',
	sharing: 'sharing',
	type: 'type',
};

const SEQUENCE_OPTION_MAP = {
	[SEQUENCE_OPTION.cycle]: {
		[OPTION_VALUE.true]: SEQUENCE_OPTION.cycle,
		[OPTION_VALUE.false]: SEQUENCE_OPTION.noCycle,
	},
	[SEQUENCE_OPTION.order]: {
		[OPTION_VALUE.true]: SEQUENCE_OPTION.order,
		[OPTION_VALUE.false]: SEQUENCE_OPTION.noOrder,
	},
	[SEQUENCE_OPTION.shard]: {
		[OPTION_VALUE.true]: SEQUENCE_OPTION.shard,
		[OPTION_VALUE.false]: '',
	},
	[SEQUENCE_OPTION.scale]: {
		[OPTION_VALUE.true]: SEQUENCE_OPTION.scale,
		[OPTION_VALUE.false]: SEQUENCE_OPTION.noScale,
	},
	[SEQUENCE_OPTION.type]: {
		[OPTION_VALUE.true]: SEQUENCE_OPTION.session,
		[OPTION_VALUE.false]: SEQUENCE_OPTION.global,
	},
	[SEQUENCE_OPTION.keep]: {
		[OPTION_VALUE.true]: SEQUENCE_OPTION.keep,
		[OPTION_VALUE.false]: SEQUENCE_OPTION.noKeep,
	},
	[SEQUENCE_OPTION.extend]: {
		[OPTION_VALUE.true]: SEQUENCE_OPTION.extend,
		[OPTION_VALUE.false]: SEQUENCE_OPTION.noExtend,
	},
};

/**
 * @param {{ schema: string, execute: Execute, logger: object, allDDLs: string }}
 * @returns {Promise<SequenceDto[]>}
 */
const getSchemaSequenceDtos = async ({ schema, allDDLs, execute, logger }) => {
	try {
		logger.log('info', { message: 'Start getting sequences' }, 'Getting sequences');
		const rawSequenceDtos = (
			await execute(
				`
				SELECT JSON_OBJECT(
				    'sharing'      VALUE ALL_OBJECTS.SHARING,
				    'sequenceName' VALUE ALL_SEQUENCES.SEQUENCE_NAME,
				    'minValue'     VALUE ALL_SEQUENCES.MIN_VALUE,
				    'maxValue'     VALUE ALL_SEQUENCES.MAX_VALUE,
				    'increment'    VALUE ALL_SEQUENCES.INCREMENT_BY,
				    'cycle'        VALUE ALL_SEQUENCES.CYCLE_FLAG,
				    'order'        VALUE ALL_SEQUENCES.ORDER_FLAG,
				    'cacheValue'   VALUE ALL_SEQUENCES.CACHE_SIZE,
				    'scale'        VALUE ALL_SEQUENCES.SCALE_FLAG,
				    'extend'       VALUE ALL_SEQUENCES.EXTEND_FLAG,
				    'shard'        VALUE ALL_SEQUENCES.SHARDED_FLAG,
				    'type'         VALUE ALL_SEQUENCES.SESSION_FLAG,
				    'keep'         VALUE ALL_SEQUENCES.KEEP_VALUE
				)
				FROM ALL_OBJECTS
				LEFT JOIN ALL_SEQUENCES
				  ON ALL_SEQUENCES.SEQUENCE_OWNER = ALL_OBJECTS.OWNER
				  AND ALL_SEQUENCES.SEQUENCE_NAME = ALL_OBJECTS.OBJECT_NAME
				LEFT JOIN ALL_TAB_IDENTITY_COLS
				  ON ALL_TAB_IDENTITY_COLS.SEQUENCE_NAME = ALL_SEQUENCES.SEQUENCE_NAME
				  AND ALL_TAB_IDENTITY_COLS.OWNER = ALL_OBJECTS.OWNER
				-- take only sequences that are not associated with identity columns
				WHERE ALL_OBJECTS.OBJECT_TYPE = 'SEQUENCE' AND ALL_TAB_IDENTITY_COLS.COLUMN_NAME IS NULL
				AND ALL_OBJECTS.OWNER = '${schema}'
     		 `,
			)
		).map(([rawSequence]) => JSON.parse(rawSequence));

		logger.log(
			'info',
			{ message: 'Finish getting sequences', count: rawSequenceDtos?.length || 0 },
			'Getting sequences',
		);

		if (!rawSequenceDtos?.length) {
			return [];
		}

		const usedSequences = filterUsedSequences({ sequenceDtos: rawSequenceDtos, allDDLs });

		logger.log(
			'info',
			{
				message: 'Filtering of sequences used in tables and views finished',
				usedSequencesCount: usedSequences?.length || 0,
			},
			'Getting sequences',
		);

		const ddlScriptMap = await getSchemaSequenceDdl({
			schema,
			namesOfSequences: usedSequences.map(sequenceDto => sequenceDto.sequenceName),
			execute,
			logger,
		});

		return usedSequences.map(sequenceDto => {
			const ddlScript = ddlScriptMap[sequenceDto.sequenceName] || '';

			return {
				...sequenceDto,
				ddlScript,
			};
		});
	} catch (error) {
		logger.progress({
			message: `Warning: Getting sequences failed: sequences are not reverse-engineered.`,
			containerName: schema,
			entityName: '',
		});

		const { message, stack, ...err } = error;
		logger.log('error', { message: 'Cannot get sequences', error: { message, stack, err } }, 'Getting sequences');

		return [];
	}
};

/**
 * @param {{ schema: string, namesOfSequences: string[], execute: Execute, logger: object }}
 * @returns {Promise<{ [sequenceName: string]: string }>}
 */
const getSchemaSequenceDdl = async ({ schema, namesOfSequences, execute, logger }) => {
	try {
		logger.log('info', { message: 'Start getting sequences DDL' }, 'Getting DDL of sequences');

		const sequenceDdlScriptsPromise = mapLimit(namesOfSequences, 50, async sequenceName => {
			try {
				const sequenceDdlScript = await execute(
					`SELECT JSON_OBJECT('ddl' VALUE DBMS_METADATA.GET_DDL('SEQUENCE', '${sequenceName}', '${schema}')) FROM DUAL`,
				);

				return [sequenceName, JSON.parse(sequenceDdlScript?.[0]?.[0] || '{}')?.ddl || ''];
			} catch (error) {
				const { message, stack, ...err } = error;
				logger.log('error', { sequenceName, schema, message, stack, err }, 'Getting sequence DDL ERROR');

				return [sequenceName, ''];
			}
		});

		const sequenceDdlScripts = await Promise.race([
			sequenceDdlScriptsPromise,
			throwErrorOnTimeout(30000, 'Timeout error on getting sequences DDL.'),
		]);

		logger.log(
			'info',
			{ message: 'Finish getting sequences DDL', count: sequenceDdlScripts?.length || 0 },
			'Getting DDL of sequences',
		);

		if (!sequenceDdlScripts?.length) {
			return {};
		}

		return Object.fromEntries(sequenceDdlScripts);
	} catch (error) {
		logger.progress({
			message: `Warning: Getting DDL of sequences failed: sequences are created but the “start with” property is defaulted to its “min/max” value.`,
			containerName: schema,
			entityName: '',
		});

		const { message, stack, ...err } = error;
		logger.log(
			'error',
			{ message: 'Cannot get sequences DDL', error: { message, stack, err } },
			'Getting DDL of sequences',
		);

		return {};
	}
};
/**
 * @param {{ execute: Execute }}
 * @returns {({ schema, logger }: { schema: string, allDDLs: string, logger: object }) => Promise<Sequence[]>}
 */
const getSchemaSequences =
	({ execute }) =>
	async ({ schema, allDDLs, logger }) => {
		const sequenceDtos = await getSchemaSequenceDtos({ schema, allDDLs, execute, logger });

		return sequenceDtos.map(sequenceDto => {
			const sharing = getSequenceSharing({ sequenceDto });
			const options = getBooleanOptions({ sequenceDto });
			const optionsFromDdl = getOptionsFromDdl({ sequenceDto });
			const extendOptions = getExtendOptions({ sequenceDto });
			const cache = sequenceDto.cacheValue ? SEQUENCE_OPTION.cache : SEQUENCE_OPTION.noCache;

			return {
				sequenceName: sequenceDto.sequenceName,
				minValue: sequenceDto.minValue,
				maxValue: sequenceDto.maxValue,
				increment: sequenceDto.increment,
				cacheValue: sequenceDto.cacheValue,
				cache,
				sharing,
				...options,
				...optionsFromDdl,
				...extendOptions,
			};
		});
	};

/**
 * @param {{ sequenceDto: SequenceDto }}
 * @returns {string}
 */
const getSequenceSharing = ({ sequenceDto }) => {
	return sequenceDto.sharing?.replace(SHARING_LINK_REGEX, '')?.toLowerCase();
};

/**
 * @param {{ sequenceDto: SequenceDto }}
 * @returns {Options}
 */
const getExtendOptions = ({ sequenceDto }) => {
	const scaleValue = sequenceDto[SEQUENCE_OPTION.scale];
	const shardValue = sequenceDto[SEQUENCE_OPTION.shard];
	const extendValue = sequenceDto[SEQUENCE_OPTION.extend];
	const extend = SEQUENCE_OPTION_MAP[SEQUENCE_OPTION.extend][extendValue];
	const scaleExtend = scaleValue === OPTION_VALUE.true ? extend : '';
	const shardExtend = shardValue === OPTION_VALUE.true ? extend : '';

	return {
		scaleExtend,
		shardExtend,
	};
};

/**
 * @param {{ sequenceDto: SequenceDto }}
 * @returns {Options}
 */
const getBooleanOptions = ({ sequenceDto }) => {
	return Object.entries(SEQUENCE_OPTION_MAP).reduce((result, [optionName, optionMap]) => {
		return {
			...result,
			[optionName]: optionMap[sequenceDto[optionName]],
		};
	}, {});
};

/**
 * @param {{ sequenceDto: SequenceDto }}
 * @returns {Options}
 */
const getOptionsFromDdl = ({ sequenceDto }) => {
	const start = getStartOptionFromDdl({ sequenceDto });

	return {
		start,
	};
};

/**
 * @param {{ sequenceDto: SequenceDto }}
 * @returns {number | undefined}
 */
const getStartOptionFromDdl = ({ sequenceDto }) => {
	const ddlScript = sequenceDto.ddlScript;

	if (!ddlScript.includes('START WITH')) {
		return sequenceDto.minValue < sequenceDto.maxValue ? sequenceDto.minValue : sequenceDto.maxValue;
	}

	const start = ddlScript.match(START_VALUE_REGEX)?.[2];

	return !isNaN(Number(start)) ? Number(start) : start;
};

const throwErrorOnTimeout = (timeout, errorMessage) =>
	new Promise((resolve, reject) =>
		setTimeout(() => reject(new Error(errorMessage + ' TIMEOUT: ' + timeout)), timeout),
	);

/**
 * @param {{ sequenceDtos: SequenceDto[], allDDLs: string }}
 */
const filterUsedSequences = ({ sequenceDtos, allDDLs }) => {
	const usedSequences = [];

	for (const sequence of sequenceDtos) {
		const sequenceRegexp = new RegExp('\\b' + sequence.sequenceName + '\\b', 'i');

		if (sequenceRegexp.test(allDDLs)) {
			usedSequences.push(sequence);
		}
	}

	return usedSequences;
};

module.exports = {
	getSchemaSequences,
};
