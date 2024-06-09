const perplex = require('perplex').default;

function parseObject(lex, obj = {}) {
	lex.expect('(');
	const id = lex.expect('WORD').match;
	lex.expect('=');

	let value;
	if (lex.peek().type === '(') {
		value = {};
		do {
			Object.assign(value, parseObject(lex, obj));
		} while (lex.peek().type === '(');
	} else {
		value = lex.expect('WORD').match;
	}

	lex.expect(')');

	return Object.assign({}, obj, { [id]: value });
}

const parseConnection = lex => {
	const serviceName = lex.expect('WORD').match;
	lex.expect('=');

	return {
		name: serviceName,
		data: parseObject(lex),
	};
};

const parseTns = data => {
	const lex = new perplex(data)
		.token('$SKIP_COMMENT', /#[^\n]*/, true)
		.token('$SKIP_WS', /\s+/, true)
		.token('WORD', /([a-z0-9._-]+|["'][\s\S]*?["'])/i)
		.token('(', /\(/)
		.token(')', /\)/)
		.token('=', /=/);

	const services = {};
	while (lex.peek().type !== null) {
		const service = parseConnection(lex);

		services[service.name] = service;
	}

	return services;
};

module.exports = parseTns;
