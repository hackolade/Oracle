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
		keys: [],
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

module.exports = {
	getAddViewScriptDto,
	getDeleteViewScriptDto,
};
