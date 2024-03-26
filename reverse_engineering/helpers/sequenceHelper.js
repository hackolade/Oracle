/**
 * @typedef {Function} Execute
 * @typedef {{ [optionName: string]: string | number | undefined }} Options
 */

const {
  Sequence,
  SequenceDto,
} = require('../../forward_engineering/types/schemaSequenceTypes');

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
    [OPTION_VALUE.false]: SEQUENCE_OPTION.noShard,
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
 * @param {{ schema: string, execute: Execute, logger: object }}
 * @returns {Promise<SequenceDto[]>}
 */
const getSchemaSequenceDtos = async ({ schema, execute, logger }) => {
  try {
    const rawSequences = await execute(
      `
      SELECT JSON_OBJECT(
          'sharing'      VALUE SHARING,
          'sequenceName' VALUE SEQUENCE_NAME,
          'minValue'     VALUE MIN_VALUE,
          'maxValue'     VALUE MAX_VALUE,
          'increment'    VALUE INCREMENT_BY,
          'cycle'        VALUE CYCLE_FLAG,
          'order'        VALUE ORDER_FLAG,
          'cacheValue'   VALUE CACHE_SIZE,
          'scale'        VALUE SCALE_FLAG,
          'extend'       VALUE EXTEND_FLAG,
          'shard'        VALUE SHARDED_FLAG,
          'type'         VALUE SESSION_FLAG,
          'keep'         VALUE KEEP_VALUE
      )
      FROM ALL_OBJECTS
      LEFT JOIN ALL_SEQUENCES
                ON ALL_SEQUENCES.SEQUENCE_OWNER = ALL_OBJECTS.OWNER
                AND ALL_SEQUENCES.SEQUENCE_NAME = ALL_OBJECTS.OBJECT_NAME
      WHERE OBJECT_TYPE = 'SEQUENCE'
      AND OWNER = '${schema}'
      `
    );

    if (!rawSequences?.length) {
      return [];
    }

    const ddlScriptMap = await getSchemaSequenceDdl({
      schema,
      execute,
      logger,
    });

    return rawSequences.map(([rawSequence]) => {
      const sequenceData = JSON.parse(rawSequence);
      const ddlScript = ddlScriptMap[sequenceData.sequenceName] || '';

      return {
        ...sequenceData,
        ddlScript,
      };
    });
  } catch (error) {
    const { message, stack, ...err } = error;
    logger.log(
      'error',
      { message: 'Cannot get sequences', error: { message, stack, err } },
      'Getting sequences'
    );

    return [];
  }
};

/**
 * @param {{ schema: string, execute: Execute, logger: object }}
 * @returns {Promise<{ [sequenceName: string]: string }>}
 */
const getSchemaSequenceDdl = async ({ schema, execute, logger }) => {
  try {
    const sequenceDdlScripts = await execute(
      `
      SELECT JSON_OBJECT(
          'sequenceName' VALUE OBJECT_NAME,
          'ddlScript'    VALUE DBMS_METADATA.GET_DDL(OBJECT_TYPE, OBJECT_NAME, OWNER)
      )
      FROM ALL_OBJECTS
      WHERE OBJECT_TYPE = 'SEQUENCE'
      AND OWNER = '${schema}'
      `
    );

    if (!sequenceDdlScripts?.length) {
      return {};
    }

    return sequenceDdlScripts.reduce((result, [rawDdlScript]) => {
      const { sequenceName, ddlScript } = JSON.parse(rawDdlScript);

      return {
        ...result,
        [sequenceName]: ddlScript,
      };
    }, {});
  } catch (error) {
    const { message, stack, ...err } = error;

    logger.log(
      'error',
      { message: 'Cannot get sequences DDL', error: { message, stack, err } },
      'Getting sequences'
    );

    return {};
  }
};
/**
 * @param {{ execute: Execute }}
 * @returns {({ schema, logger }: { schema: string, logger: object }) => Promise<Sequence[]>}
 */
const getSchemaSequences =
  ({ execute }) =>
  async ({ schema, logger }) => {
    const sequences = await getSchemaSequenceDtos({ schema, execute, logger });

    return sequences.map((sequenceData) => {
      const sharing = getSequenceSharing({ sequenceData });
      const options = getBooleanOptions({ sequenceData });
      const optionsFromDdl = getOptionsFromDdl({ sequenceData });
      const extendOptions = getExtendOptions({ sequenceData });
      const cache = sequenceData.cacheValue
        ? SEQUENCE_OPTION.cache
        : SEQUENCE_OPTION.noCache;

      return {
        sequenceName: sequenceData.sequenceName,
        minValue: sequenceData.minValue,
        maxValue: sequenceData.maxValue,
        increment: sequenceData.increment,
        cacheValue: sequenceData.cacheValue,
        cache,
        sharing,
        ...options,
        ...optionsFromDdl,
        ...extendOptions,
      };
    });
  };

/**
 * @param {{ sequenceData: SequenceDto }}
 * @returns {string}
 */
const getSequenceSharing = ({ sequenceData }) => {
  return sequenceData.sharing?.replace(SHARING_LINK_REGEX, '')?.toLowerCase();
};

/**
 * @param {{ sequenceData: SequenceDto }}
 * @returns {Options}
 */
const getExtendOptions = ({ sequenceData }) => {
  const scaleValue = sequenceData[SEQUENCE_OPTION.scale];
  const shardValue = sequenceData[SEQUENCE_OPTION.shard];
  const extendValue = sequenceData[SEQUENCE_OPTION.extend];
  const extend = SEQUENCE_OPTION_MAP[SEQUENCE_OPTION.extend][extendValue];
  const scaleExtend = scaleValue === OPTION_VALUE.true ? extend : '';
  const shardExtend = shardValue === OPTION_VALUE.true ? extend : '';

  return {
    scaleExtend,
    shardExtend,
  };
};

/**
 * @param {{ sequenceData: SequenceDto }}
 * @returns {Options}
 */
const getBooleanOptions = ({ sequenceData }) => {
  return Object.entries(SEQUENCE_OPTION_MAP).reduce(
    (result, [optionName, optionMap]) => {
      return {
        ...result,
        [optionName]: optionMap[sequenceData[optionName]],
      };
    },
    {}
  );
};

/**
 * @param {{ sequenceData }}
 * @returns {Options}
 */
const getOptionsFromDdl = ({ sequenceData }) => {
  const start = getStartOptionFromDdl({ sequenceData });

  return {
    start,
  };
};

/**
 * @param {{ sequenceData }}
 * @returns {number | undefined}
 */
const getStartOptionFromDdl = ({ sequenceData }) => {
  const ddlScript = sequenceData.ddlScript;

  if (!ddlScript.includes('START WITH')) {
    return sequenceData.minValue < sequenceData.maxValue
      ? sequenceData.minValue
      : sequenceData.maxValue;
  }

  const start = ddlScript.match(START_VALUE_REGEX)?.[2];

  return !isNaN(Number(start)) ? Number(start) : start;
};

module.exports = {
  getSchemaSequences,
};
