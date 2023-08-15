
/**
 * @typedef {{
 *     view: Object,
 *     jsonSchema: Object
 * }} CreateViewDto
 * */


/**
 * @abstract
 * */
class AbstractDualityViewFeDdlCreator {

    /**
     * @param ddlTemplates {Object}
     * @param assignTemplates {(template: string, values: Object) => string}
     * @param lodash {any}
     * @throws {Error}
     * */
    constructor(ddlTemplates, assignTemplates, lodash) {
        if (this.constructor === AbstractDualityViewFeDdlCreator) {
            throw new Error("Abstract classes can't be instantiated.");
        }
        this._ddlTemplates = ddlTemplates;
        this._assignTemplates = assignTemplates;
        this._lodash = lodash;
    }

    /**
     * @param s {string}
     * @return {string}
     * */
    padInFront(s) {
        return ` ${s}`;
    }

    /**
     * @param s {string}
     * @return {string}
     * */
    padInFrontAndUppercaseIfExists(s) {
        if (!s) {
            return ''
        }
        return this.padInFront(s).toUpperCase();
    }

    /**
     * @param entity {Object}
     * @return {string}
     * */
    _getForceStatement(entity) {
        return this.padInFrontAndUppercaseIfExists(entity.force);
    }

    /**
     * @param entity {Object}
     * @return {string}
     * */
    _getOrReplaceStatement(entity) {
        return entity.orReplace ? ' OR REPLACE' : '';
    }

    /**
     * @param entity {Object}
     * @return {string}
     * */
    _getEditionableStatement(entity) {
        return this.padInFrontAndUppercaseIfExists(entity.editionable);
    }

    /**
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    getCreateJsonRelationalDualityViewHeadingDdl(createViewDto) {
        const { jsonSchema, view } = createViewDto;
        const {getViewName, getNamePrefixedWithSchemaName} = require('../../utils/general')(this._lodash);
        const template = this._ddlTemplates?.dualityView?.createJsonRelationalDualityViewHeading || '';

        const orReplaceStatement = this._getOrReplaceStatement(view);
        const forceStatement = this._getForceStatement(jsonSchema);
        const editionableStatement = this._getEditionableStatement(jsonSchema);
        const viewName = getViewName(view);
        const ddlViewName = getNamePrefixedWithSchemaName(viewName, view.schemaName);

        const params = {
            orReplaceStatement,
            forceStatement,
            editionableStatement,
            viewName: ddlViewName,
        };
        return this._assignTemplates(template, params);
    }

    /**
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    getDualityViewBodyDdl(createViewDto) {
        throw new Error(`Not implemented`);
    }

    /**
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    convertDualityViewToDdl(createViewDto) {
        const heading = this.getCreateJsonRelationalDualityViewHeadingDdl(createViewDto);
        const body = this.getDualityViewBodyDdl(createViewDto);
        return heading + '\n' + body;
    }

}

module.exports = {
    AbstractDualityViewFeDdlCreator
}
