const { KeyScriptModificationDto } = require('../../types/AlterKeyDto');

/**
 * @param {KeyScriptModificationDto[]} constraintDtos
 * @return {KeyScriptModificationDto[]}
 * */
const sortModifyKeyConstraints = constraintDtos => {
	return constraintDtos.sort((c1, c2) => {
		if (c1.fullTableName === c2.fullTableName) {
			// Number(true) = 1, Number(false) = 0;
			// This ensures that DROP script appears before CREATE script
			// if the same table has 2 scripts that drop and recreate PK
			return Number(c2.isDropScript) - Number(c1.isDropScript);
		}
		// This sorts all statements based on full table name, ASC
		return c1.fullTableName < c2.fullTableName ? 0 : 1;
	});
};

module.exports = {
	sortModifyKeyConstraints,
};
