const {DualityViewPropertiesType} = require("../../../enums/DualityViewPropertiesType");

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
     * @param view {DualityViewJsonSchema | Object}
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
        return element?.type === DualityViewPropertiesType.JOIN_SUBQUERY_TYPE;
    }

    /**
     * @param element {Object}
     * @return {boolean}
     * */
    static isRegularDualityViewFieldOnRootLevelOrInObjectSubquery(element = {}) {
        const { ref, refIdPath, refType } = element;
        return ref && (refIdPath || []).length === 2 && refType === DualityViewPropertiesType.COLLECTION_REFERENCE;
    }

    /**
     * @param element {Object}
     * @return {boolean}
     * */
    static isRegularDualityViewFieldInArraySubquery(element = {}) {
        const { ref, refId } = element;
        return ref && refId;
    }

    /**
     * @param element {Object}
     * @return {boolean}
     * */
    static isRegularDualityViewField(element = {}) {
        return AbstractDualityViewFeDdlCreator.isRegularDualityViewFieldOnRootLevelOrInObjectSubquery(element)
            || AbstractDualityViewFeDdlCreator.isRegularDualityViewFieldInArraySubquery(element);
    }

    /**
     * @param propertyJsonSchema {RegularDualityViewField}
     * @param parent {DualityView | JoinSubquery}
     * @return {string[]}
     * */
    static getPathToReferencedColumn(propertyJsonSchema, parent) {
        let pathToReferencedColumn = [];
        if (AbstractDualityViewFeDdlCreator.isRegularDualityViewFieldOnRootLevelOrInObjectSubquery(propertyJsonSchema)) {
            pathToReferencedColumn = propertyJsonSchema.refIdPath;
        } else if (AbstractDualityViewFeDdlCreator.isRegularDualityViewFieldInArraySubquery(propertyJsonSchema)) {
            pathToReferencedColumn = [
                ...(parent.joinedCollectionRefIdPath || []),
                propertyJsonSchema.ref,
            ];
        }
        return pathToReferencedColumn;
    }

    /**
     * @param pathToReferencedColumn {Array<string>}
     * @param relatedSchemas {DualityViewRelatedSchemas}
     * @return {string}
     * */
    static getRegularFieldNameFromCollection(pathToReferencedColumn, relatedSchemas) {
        if (pathToReferencedColumn.length < 2) {
            throw new Error('Cannot extract referenced column name');
        }
        const collectionId = pathToReferencedColumn[0];
        const fieldId = pathToReferencedColumn[1];
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
     * @param paddingFactor {number}
     * @return {string}
     * */
    static getKeyValueFrontPadding(paddingFactor) {
        return '\t'.repeat(paddingFactor);
    }

    /**
     * @param entity {DualityViewJsonSchema}
     * @return {string}
     * */
    _getForceStatement(entity) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(entity.force);
    }

    /**
     * @param entity {DualityView}
     * @return {string}
     * */
    _getOrReplaceStatement(entity) {
        return entity.orReplace ? ' OR REPLACE' : '';
    }

    /**
     * @param entity {DualityViewJsonSchema}
     * @return {string}
     * */
    _getEditionableStatement(entity) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(entity.editionable);
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {RegularDualityViewField}
     * @return {string}
     * */
    static getRegularFieldName(propertyName, propertyJsonSchema) {
        return propertyJsonSchema.code || propertyName || propertyJsonSchema.referencedColumnName;
    }

    /**
     * @param createViewDto {CreateDualityViewDto}
     * @return {string}
     * */
    getCreateJsonRelationalDualityViewHeadingDdl(createViewDto) {
        const { jsonSchema, view } = createViewDto;
        const {getViewName, getNamePrefixedWithSchemaName} = require('../../../utils/general')(this._lodash);
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
     * @param createViewDto {CreateDualityViewDto}
     * @return {string}
     * */
    getDualityViewBodyDdl(createViewDto) {
        throw new Error(`Not implemented`);
    }

    /**
     * @param createViewDto {CreateDualityViewDto}
     * @return {string}
     * */
    convertDualityViewToDdl(createViewDto) {
        const heading = this.getCreateJsonRelationalDualityViewHeadingDdl(createViewDto);
        const body = this.getDualityViewBodyDdl(createViewDto);
        return heading + '\n' + body + '\n';
    }

}

module.exports = {
    AbstractDualityViewFeDdlCreator
}
