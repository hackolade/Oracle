const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { App } = require('../../../types/coreApplicationTypes');
const sequencesCompModKey = 'sequences';

/**
 * @param {{ app: App }}
 * @return {({ container, dbVersion }: { container: object, dbVersion: string }) => AlterScriptDto[]}
 * */
const getAddContainerSequencesScriptDtos =
	({ app }) =>
	({ container, dbVersion }) => {
		const _ = app.require('lodash');
		const ddlProvider = require('../../../ddlProvider')(null, { dbVersion }, app);
		const { getDbName } = require('../../../utils/general')(_);
		const schemaName = getDbName([container.role]);

		return (container.role?.sequences || [])
			.map(sequence => {
				const script = ddlProvider.createSchemaSequence({ schemaName, sequence });

				return AlterScriptDto.getInstance([script], true, false);
			})
			.filter(Boolean);
	};

/**
 * @param {{ app: App }}
 * @return {({ container }: { container: object, dbVersion: string }) => AlterScriptDto[]}
 * */
const getModifyContainerSequencesScriptDtos =
	({ app }) =>
	({ container, dbVersion }) => {
		const _ = app.require('lodash');
		const ddlProvider = require('../../../ddlProvider')(null, { dbVersion }, app);
		const { getDbName, getGroupItemsByCompMode } = require('../../../utils/general')(_);

		const schemaName = getDbName([container.role]);
		const sequencesCompMod = container.role?.compMod?.[sequencesCompModKey] || {};
		const { new: newItems = [], old: oldItems = [] } = sequencesCompMod;

		const { removed, added, modified } = getGroupItemsByCompMode({
			newItems,
			oldItems,
		});

		const removedScriptDtos = removed.map(sequence => {
			const script = ddlProvider.dropSchemaSequence({ schemaName, sequence });

			return AlterScriptDto.getInstance([script], true, true);
		});

		const addedScriptDtos = added.map(sequence => {
			const script = ddlProvider.createSchemaSequence({ schemaName, sequence });

			return AlterScriptDto.getInstance([script], true, false);
		});

		const modifiedScriptDtos = modified.map(sequence => {
			const oldSequence = _.find(oldItems, { id: sequence.id }) || {};
			const script = ddlProvider.alterSchemaSequence({ schemaName, sequence, oldSequence });
			const isDropScript = script.startsWith('DROP');

			return AlterScriptDto.getInstance([script], true, isDropScript);
		});

		return [...modifiedScriptDtos, ...removedScriptDtos, ...addedScriptDtos].filter(Boolean);
	};

/**
 * @param {{ app: App }}
 * @return {({ container }: { container: object, dbVersion: string }) => AlterScriptDto[]}
 * */
const getDeleteContainerSequencesScriptDtos =
	({ app }) =>
	({ container, dbVersion }) => {
		const _ = app.require('lodash');
		const ddlProvider = require('../../../ddlProvider')(null, { dbVersion }, app);
		const { getDbName } = require('../../../utils/general')(_);
		const schemaName = getDbName([container.role]);

		return (container.role?.sequences || [])
			.map(sequence => {
				const script = ddlProvider.dropSchemaSequence({ schemaName, sequence });

				return AlterScriptDto.getInstance([script], true, true);
			})
			.filter(Boolean);
	};

module.exports = {
	getAddContainerSequencesScriptDtos,
	getModifyContainerSequencesScriptDtos,
	getDeleteContainerSequencesScriptDtos,
};
