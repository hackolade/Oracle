const JOIN_SUBQUERY_TYPE = 'joinSubquery';
const COLLECTION_REFERENCE = 'collectionReference';

/**
 * @typedef {{
 *     view: Object,
 *     jsonSchema: Object,
 *     relatedSchemas: Object
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
    static padInFront(s) {
        return ` ${s}`;
    }

    /**
     * @param s {string}
     * @return {string}
     * */
    static padInFrontAndUppercaseIfExists(s) {
        if (!s) {
            return ''
        }
        return AbstractDualityViewFeDdlCreator.padInFront(s).toUpperCase();
    }

    /**
     * @param view {Object}
     * @return {boolean}
     * */
    static isDualityView(view = {}) {
        return view.viewOn && view.duality;
    }

    /**
     * @param element {Object}
     * @return {boolean}
     * */
    static isJoinSubquery(element = {}) {
        return element?.type === JOIN_SUBQUERY_TYPE;
    }

    /**
     * @param element {Object}
     * @return {boolean}
     * */
    static isRegularDualityViewField(element = {}) {
        const { ref, refIdPath, refType } = element;
        return ref && (refIdPath || []).length === 2 && refType === COLLECTION_REFERENCE;
    }

    /**
     * @param refIdPath {Array<string>}
     * @param relatedSchemas {Object}
     * @return {string}
     * */
    static getRegularFieldNameFromCollection(refIdPath, relatedSchemas) {
        const collectionId = refIdPath[0];
        const fieldId = refIdPath[1];
        const collection = relatedSchemas[collectionId];
        const properties = collection?.properties || [];
        for (const name of Object.keys(properties)) {
            const jsonSchema = properties[name];
            if (jsonSchema.GUID === fieldId) {
                return name;
            }
        }
        return '';
    }

    /**
     * @param recursionDepth {number}
     * @return {string}
     * */
    static getKeyValueFrontPadding(recursionDepth) {
        return '\t'.repeat(recursionDepth);
    }

    /**
     * @param entity {Object}
     * @return {string}
     * */
    _getForceStatement(entity) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(entity.force);
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
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(entity.editionable);
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
