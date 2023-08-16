const {AbstractDualityViewFeDdlCreator} = require('./abstractDualityViewDdlCreator');


class SqlDualityViewDdlCreator extends AbstractDualityViewFeDdlCreator {

    /**
     * @param ddlTemplates {Object}
     * @param lodash {any}
     * @param assignTemplates {(template: string, values: Object) => string}
     * @throws {Error}
     * */
    constructor(ddlTemplates, assignTemplates, lodash) {
        super(ddlTemplates, assignTemplates, lodash);
    }

    /**
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    _getFromRootTableAliasStatement(createViewDto) {
        const { view } = createViewDto;
        if (view.rootTableAlias) {
            return AbstractDualityViewFeDdlCreator.padInFront(view.rootTableAlias);
        }
        return '';
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getCheckStatement(tagsClause) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(tagsClause.check);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getEtagStatement(tagsClause) {
        const etag = tagsClause.etag ? 'etag' : ''
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(etag);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getDeleteStatement(tagsClause) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(tagsClause.delete);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getInsertStatement(tagsClause) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(tagsClause.insert);
    }

    /**
     * @param tagsClause {Object}
     * @return {string}
     * */
    _getUpdateStatement(tagsClause) {
        return AbstractDualityViewFeDdlCreator.padInFrontAndUppercaseIfExists(tagsClause.update);
    }

    /**
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    _getTableTagsStatement(createViewDto) {
        const { view } = createViewDto;
        const tagsClause = view.rootTableTagsClause || {};
        const checkStatement = this._getCheckStatement(tagsClause);
        let etagStatement = '';
        if (checkStatement) {
            etagStatement = this._getEtagStatement(tagsClause);
        }
        const insertStatement = this._getInsertStatement(tagsClause);
        const updateStatement = this._getUpdateStatement(tagsClause);
        const deleteStatement = this._getDeleteStatement(tagsClause);

        const ddlConfig = {
            checkStatement, etagStatement, insertStatement, updateStatement, deleteStatement
        }
        const statements = Object.values(ddlConfig);
        if (statements.some(s => s?.length)) {
            const template = this._ddlTemplates.dualityView.sql.tableTagsStatement;
            const statement = this._assignTemplates(template, ddlConfig)
            return AbstractDualityViewFeDdlCreator.padInFront(statement);
        }
        return '';
    }

    /**
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    _getFromRootTableStatement(createViewDto) {
        const {view} = createViewDto;
        const {getNamePrefixedWithSchemaName} = require('../../utils/general')(this._lodash);
        const ddlTableName = getNamePrefixedWithSchemaName(view.tableName, view.schemaName);
        const aliasStatement = this._getFromRootTableAliasStatement(createViewDto);
        const tagsClauseStatement = this._getTableTagsStatement(createViewDto);

        const template = this._ddlTemplates.dualityView.sql.fromRootTableStatement;
        return this._assignTemplates(template, {
            tableName: ddlTableName,
            tableAlias: aliasStatement,
            tableTagsStatement: tagsClauseStatement,
        })
    }

    /**
     * @param parentEntity {Object}
     * @param propertyName {string}
     * @return {string}
     * */
    _getNameOfReferencedColumnForDdl(parentEntity, propertyName) {
        const {getNamePrefixedWithSchemaName} = require('../../utils/general')(this._lodash);
        if (AbstractDualityViewFeDdlCreator.isDualityView(parentEntity)) {
            const parentName = parentEntity.rootTableAlias || parentEntity.tableName;
            return getNamePrefixedWithSchemaName(propertyName, parentName);
        }
        if (AbstractDualityViewFeDdlCreator.isJoinSubquery(parentEntity)) {
            const parentName = parentEntity.childTableAlias || '';
            return getNamePrefixedWithSchemaName(propertyName, parentName);
        }
        return '';
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {Object}
     * @return {string}
     * */
    _getRegularFieldName(propertyName, propertyJsonSchema) {
        return propertyJsonSchema.jsonKey || propertyName;
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {Object}
     * @param parent {Object}
     * @param recursionDepth {number}
     * @return {string}
     * */
    _buildRegularFieldKeyValueStatement(propertyName, propertyJsonSchema, parent, recursionDepth) {
        const {wrapInQuotes} = require('../../utils/general')(this._lodash);

        const padding = AbstractDualityViewFeDdlCreator.getKeyValueFrontPadding(recursionDepth);
        const fieldName = this._getRegularFieldName(propertyName, propertyJsonSchema);
        const ddlFieldName = wrapInQuotes(fieldName);

        return `${padding}${ddlFieldName}: `;
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {Object}
     * @param recursionDepth {number}
     * @return {string}
     * */
    _buildJoinSubqueryKeyValueStatement(propertyName, propertyJsonSchema, recursionDepth) {
        const {wrapInQuotes} = require('../../utils/general')(this._lodash);

        const subqueryStatement = '';
        const padding = AbstractDualityViewFeDdlCreator.getKeyValueFrontPadding(recursionDepth);
        if (propertyJsonSchema.unnestSubquery) {
            return `${padding}UNNEST (\n${subqueryStatement}\n${padding})`
        }
        const subqueryName = this._getJoinSubqueryName(propertyName, propertyJsonSchema);
        const subqueryDdlName = wrapInQuotes(subqueryName);
        if (this._lodash.toLower(propertyJsonSchema.subqueryType) === 'array') {
            return `${padding}${subqueryDdlName} : [\n${subqueryStatement}\n${padding}]`;
        }
        return `${padding}${subqueryDdlName} : {\n${subqueryStatement}\n${padding}}`;
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {Object}
     * @return {string}
     * */
    _getJoinSubqueryName(propertyName, propertyJsonSchema) {
        return propertyJsonSchema.name || propertyName;
    }

    /**
     * @param propertyName {string}
     * @param propertyJsonSchema {Object}
     * @param parent {Object}
     * @param recursionDepth {number}
     * @return {string}
     * */
    _recursivelyBuildKeyValueStatement(propertyName, propertyJsonSchema, parent, recursionDepth) {
        if (AbstractDualityViewFeDdlCreator.isRegularDualityViewField(propertyJsonSchema)) {
            return this._buildRegularFieldKeyValueStatement(propertyName, propertyJsonSchema, parent, recursionDepth);
        }
        if (AbstractDualityViewFeDdlCreator.isJoinSubquery(propertyJsonSchema)) {
            return this._buildJoinSubqueryKeyValueStatement(propertyName, propertyJsonSchema, recursionDepth);
        }
        return '';
    }

    /**
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    _getKeyValueStatement(createViewDto) {
        const statements = [];
        const {view, jsonSchema} = createViewDto;
        const propertyNameToJsonSchemaPairs = this._lodash.toPairs(jsonSchema.properties || {});
        for (const [propertyName, propertyJsonSchema] of propertyNameToJsonSchemaPairs) {
            const statement = this._recursivelyBuildKeyValueStatement(propertyName, propertyJsonSchema, view, 1);
            statements.push(statement);
        }
        const result = statements.join(',\n');
        return `\n${result}\n`;
    }

    /**
     * @param createViewDto {CreateViewDto}
     * @return {string}
     * */
    _getObjectGenStatement(createViewDto) {
        const keyValueStatement = this._getKeyValueStatement(createViewDto);
        const template = this._ddlTemplates.dualityView.sql.objectGenStatement;
        const objectGenClause = this._assignTemplates(template, {
            keyValueStatement
        });
        return AbstractDualityViewFeDdlCreator.padInFront(objectGenClause);
    }

    getDualityViewBodyDdl(createViewDto) {
        const objectGenStatement = this._getObjectGenStatement(createViewDto);
        const bodyWithGenStatement = `SELECT${objectGenStatement}`;
        const body = [bodyWithGenStatement];
        const fromRootTableStatement = this._getFromRootTableStatement(createViewDto);
        body.push(fromRootTableStatement + ';');
        return body.join('\n');
    }
}

module.exports = {
    SqlDualityViewDdlCreator,
}
