const { AlterScriptDto } = require('../types/AlterScriptDto');
const { mapDeltaDualityViewToFeDualityView } = require('./dualityViewHelpers/deltaDualityViewToFeDualityViewMapper');
const _ = require('lodash');

/**
 * @return {(view: Object) => AlterScriptDto | undefined}
 * */
const getAddRegularViewScriptDto = app => view => {
	const ddlProvider = require('../../ddlProvider/ddlProvider')(null, null, app);
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
const getDualityViewScriptDto = app => view => {
	const ddlProvider = require('../../ddlProvider/ddlProvider')(null, null, app);

	const createDualityViewDto = mapDeltaDualityViewToFeDualityView(_)(view);
	const script = ddlProvider.createDualityView(createDualityViewDto);
	return AlterScriptDto.getInstance([script], true, false);
};

/**
 * @return {(view: Object) => AlterScriptDto | undefined}
 * */
const getAddViewScriptDto = app => view => {
	if (view.duality) {
		return getDualityViewScriptDto(app)(view);
	}
	if (view.selectStatement) {
		return getAddRegularViewScriptDto(app)(view);
	}
	return undefined;
};

/**
 * @return {(view: Object) => AlterScriptDto | undefined}
 * */
const getDeleteViewScriptDto = app => view => {
	const { wrapInQuotes } = require('../../utils/general')(_);
	const ddlViewName = wrapInQuotes(view.code || view.name);

	const dropViewScript = `DROP VIEW ${ddlViewName};`;
	return AlterScriptDto.getInstance([dropViewScript], true, true);
};

module.exports = {
	getAddViewScriptDto,
	getDeleteViewScriptDto,
};
