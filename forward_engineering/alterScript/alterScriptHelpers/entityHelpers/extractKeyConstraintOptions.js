/**
 * @param {AlterCollectionColumnKeyOptionDto} optionHolder
 * @return {Partial<AlterCollectionColumnKeyOptionDto>}
 * */
const extractKeyConstraintOptions = (optionHolder = {}) => {
	return {
		constraintName: optionHolder.constraintName,
		deferClause: optionHolder.deferClause,
		rely: optionHolder.rely,
		validate: optionHolder.validate,
		indexClause: optionHolder.indexClause,
		exceptionClause: optionHolder.exceptionClause,
	};
};

module.exports = {
	extractKeyConstraintOptions,
};
