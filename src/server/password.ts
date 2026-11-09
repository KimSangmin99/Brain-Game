import { hash, verify } from "@node-rs/argon2";
const options = {
  algorithm: 2,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
};
export const hashPassword = (password: string) => hash(password, options);
export const verifyPassword = (encoded: string, password: string) =>
  verify(encoded, password, options);
let dummy: Promise<string> | undefined;
export const dummyHash = () =>
  (dummy ??= hashPassword("dummy-not-an-account-password"));
