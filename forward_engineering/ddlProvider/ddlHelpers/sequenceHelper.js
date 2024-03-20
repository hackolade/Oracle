/**
 * @typedef {{
* key: keyof Sequence;
* extendedKey?: string;
* clause?: string;
* getOption: ({ sequence, config } : { sequence: Sequence, config: OptionConfig }) => string
* }} OptionConfig
*/

const { Sequence } = require('../../types/schemaSequenceTypes');

module.exports = ({
  _,
  templates,
  assignTemplates,
  getNamePrefixedWithSchemaName,
  wrapIfNotExists,
}) => {

  /**
   * @param {{ schemaName: string, sequences: Sequence[], usingTryCatchWrapper: boolean }} 
   * @returns {string}
   */
  const getSequencesScript = ({ schemaName, sequences, usingTryCatchWrapper }) => {
    return _.map(sequences, (sequence) => createSequenceScript({ schemaName, sequence, usingTryCatchWrapper })).join('\n\n');
  };

  /**
   * @param {{ schemaName: string, sequence: Sequence, usingTryCatchWrapper: boolean }} 
   * @returns {string}
   */
  const createSequenceScript = ({ schemaName, sequence, usingTryCatchWrapper }) => {
    const sequenceSchemaName = sequence.session ? '' : schemaName;
    const name = getNamePrefixedWithSchemaName(sequence.sequenceName, sequenceSchemaName);
    const ifNotExists = usingTryCatchWrapper ? '' : getIfNotExists({ sequence });
    const options = getSequenceOptions({ sequence, schemaName });
    const sharing = getSharing({ sequence });

    const statement = assignTemplates(templates.createSequence, {
      name,
      ifNotExists,
      sharing,
      options,
    });

    if (usingTryCatchWrapper) {
      return wrapIfNotExists(statement, sequence.ifNotExist)
    }

    return statement + ';';
  };

  /**
   * @param {{ schemaName: string, sequence: Sequence }} 
   * @returns {string}
   */
  const getSequenceOptions = ({ schemaName, sequence }) => {
    /**
     * @type {Array<OptionConfig>}
     */
    const optionConfigs = [
      { getOption: getNumberOption,  key: 'increment',  clause: 'INCREMENT BY' },
      { getOption: getNumberOption,  key: 'start',      clause: 'START WITH' },
      { getOption: getNumberOption,  key: 'restart',    clause: 'RESTART WITH' },
      { getOption: getNumberOption,  key: 'minValue',   clause: 'MINVALUE' },
      { getOption: getNumberOption,  key: 'maxValue',   clause: 'MAXVALUE' },
      { getOption: getLiteralOption, key: 'cache', extendedKey: 'cacheValue' },
      { getOption: getLiteralOption, key: 'cycle', extendedKey: '' },
      { getOption: getLiteralOption, key: 'order', extendedKey: '' },
      { getOption: getLiteralOption, key: 'keep' , extendedKey: '' },
      { getOption: getLiteralOption, key: 'scale', extendedKey: 'scaleExtend' },
      { getOption: getLiteralOption, key: 'shard', extendedKey: 'shardExtend' },
      { getOption: getSequenceType },
    ];

    const options = optionConfigs
      .map((config) => {
        const option = config.getOption({ sequence, schemaName, config });
        return wrapOption({ option });
      })
      .filter(Boolean)
      .join('');

    return options ? wrapOptionsBlock({ options }) : options;
  };

  /**
   * @param {{ sequence: Sequence; config: OptionConfig }} 
   * @returns {string}
   */
  const getNumberOption = ({ sequence, config }) => {
    const value = Number(sequence[config.key]);
    return !isNaN(value) ? `${config.clause} ${value}` : '';
  };

  /**
   * @param {{ sequence: Sequence, config: OptionConfig }}
   * @returns {string}
   */
  const getLiteralOption = ({ sequence, config }) => {
    const value = _.toUpper(sequence[config.key]);

    if (!value) {
      return ''
    }

    if (value.startsWith('NO')) {
      return value;
    }

    const extendedValue = sequence[config.extendedKey];

    if (!extendedValue) {
      return value;
    }

    return value + ' ' + getLiteralOption({ sequence, config: { key: config.extendedKey } });
  };

  /**
   * @param {{ option: string }} 
   * @returns {string}
   */
  const wrapOption = ({ option }) => {
    return option ? `\t${option}\n` : '';
  };

  /**
   * @param {{ options: string }} 
   * @returns {string}
   */
  const wrapOptionsBlock = ({ options }) => {
    return '\n' + options.replace(/\n$/, '');
  };

  /**
   * @param {{ sequence: Sequence }} 
   * @returns {string}
   */
  const getIfNotExists = ({ sequence }) => {
    return sequence.ifNotExist ? ' IF NOT EXISTS' : '';
  };

  const getSequenceType = ({ sequence }) => {
    if (sequence.global) {
      return 'GLOBAL';
    }

    if (sequence.session) {
      return 'SESSION';
    }

    return '';
  };

  /**
   * @param {{ sequence: Sequence }} 
   * @returns {string}
   */
  const getSharing = ({ sequence }) => {
    if (!sequence.sharing) {
      return '';
    }

    return ' SHARING = ' + _.toUpper(sequence.sharing);
  };

  return {
    getSequencesScript,
    createSequenceScript,
  };
};