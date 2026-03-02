const { wrapComment } = require('./general');

/**
 * @typedef {{
 *   annotationName?: string
 *   annotationValue?: string
 * }} Annotation
 */

const UNSUPPORTED_DB_VERSIONS = new Set(['12c', '18c']);

/**
 * Generates annotations string.
 * @param {function} prepareName - Function to format/escape identifiers
 * @param {string} [dbVersion] - Database version
 * @returns {(annotations: Annotation[]) => string} - returns Annotations string (e.g: "\nANNOTATIONS (...)") or ''.
 */
const getAnnotationsString = (prepareName, dbVersion) => annotations => {
	if (!dbVersion || UNSUPPORTED_DB_VERSIONS.has(dbVersion)) {
		return '';
	}

	if (!Array.isArray(annotations) || annotations.length === 0) {
		return '';
	}

	const wrapValue = value => wrapComment(value);

	const annotationsItems = annotations
		.filter(annotation => annotation?.annotationName?.trim())
		.map(annotation => {
			const { annotationName, annotationValue } = annotation;
			const name = prepareName(annotationName.trim());

			let finalValue = '';

			if (annotationValue !== undefined && annotationValue.trim() !== '') {
				finalValue = ' ' + wrapValue(annotationValue.trim());
			}

			return `${name}${finalValue}`;
		});

	if (annotationsItems.length > 0) {
		return `ANNOTATIONS (${annotationsItems.join(', ')})`;
	}

	return '';
};

module.exports = { getAnnotationsString };
