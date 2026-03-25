export function createCaseStore() {
  const cases = new Map();

  return {
    save(caseRecord) {
      cases.set(caseRecord.case_id, caseRecord);
    },
    get(caseId) {
      return cases.get(caseId);
    }
  };
}
