import { faker } from '@faker-js/faker';

const data = Array.from({ length:100}).map(()=> ({
    firstname: faker.person.firstName(),
    lastname: faker.person.lastName(),
    email: faker.internet.email()

}));

console.log(data);