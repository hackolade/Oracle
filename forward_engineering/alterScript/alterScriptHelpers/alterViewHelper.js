const { AlterScriptDto } = require('../types/AlterScriptDto');
const { mapDeltaDualityViewToFeDualityView } = require('./dualityViewHelpers/deltaDualityViewToFeDualityViewMapper');
const _ = require('lodash');

/**
 * @return {(view: Object) => AlterScriptDto | undefined}
 * */
const getAddRegularViewScriptDto = (app, scriptFormat) => view => {
	const ddlProvider = require('../../ddlProvider/ddlProvider')(
		null,
		{ targetScriptOptions: { keyword: scriptFormat } },
		app,
	);
	const viewData = {
		name: view.code || view.name,
		keys: getKeys({
			view,
			collectionRefsDefinitionsMap: view.compMod?.collectionData?.collectionRefsDefinitionsMap ?? {},
			ddlProvider,
			app,
		}),
		schemaData: { schemaName: '' },
	};
	const hydratedView = ddlProvider.hydrateView({ viewData, entityData: [view] });
	const createViewStatement = ddlProvider.createView(hydratedView, {}, view.isActivated);
	return AlterScriptDto.getInstance([createViewStatement], true, false);
};

/**
 * @return {(view: Object) => AlterScriptDto | undefined}
 * */
const getDualityViewScriptDto = (app, scriptFormat) => view => {
	const ddlProvider = require('../../ddlProvider/ddlProvider')(
		null,
		{ targetScriptOptions: { keyword: scriptFormat } },
		app,
	);

	const createDualityViewDto = mapDeltaDualityViewToFeDualityView(_)(view);
	const script = ddlProvider.createDualityView(createDualityViewDto);
	return AlterScriptDto.getInstance([script], true, false);
};

/**
 * @return {(view: Object) => AlterScriptDto | undefined}
 * */
const getAddViewScriptDto = (app, scriptFormat) => view => {
	if (view.duality) {
		return getDualityViewScriptDto(app, scriptFormat)(view);
	}
	return getAddRegularViewScriptDto(app, scriptFormat)(view);
};

/**
 * @return {(view: Object) => AlterScriptDto | undefined}
 * */
const getDeleteViewScriptDto = (app, scriptFormat) => view => {
	const { prepareNameForScriptFormat } = require('../../utils/general')(_);
	const ddlViewName = prepareNameForScriptFormat(scriptFormat)(view.code || view.name);

	const dropViewScript = `DROP VIEW ${ddlViewName};`;
	return AlterScriptDto.getInstance([dropViewScript], true, true);
};

const getKeys = ({ view, collectionRefsDefinitionsMap, ddlProvider, app }) => {
	const { mapProperties } = app.require('@hackolade/ddl-fe-utils');

	return mapProperties(view, (propertyName, schema) => {
		const definition = collectionRefsDefinitionsMap[schema.refId];

		if (!definition) {
			return ddlProvider.hydrateViewColumn({
				name: propertyName,
				isActivated: schema.isActivated,
			});
		}

		const entityName =
			_.get(definition.collection, '[0].code', '') ||
			_.get(definition.collection, '[0].collectionName', '') ||
			'';
		const dbName = _.get(definition.bucket, '[0].code') || _.get(definition.bucket, '[0].name', '');
		const name = definition.name;

		if (name === propertyName) {
			return ddlProvider.hydrateViewColumn({
				name,
				dbName,
				entityName,
				isActivated: schema.isActivated,
			});
		}

		return ddlProvider.hydrateViewColumn({
			name,
			dbName,
			entityName,
			alias: propertyName,
			isActivated: schema.isActivated,
		});
	});
};

module.exports = {
	getAddViewScriptDto,
	getDeleteViewScriptDto,
};
