/**
 * Capitalizes the first letter of a string
 */
export const capitalizeFirstLetter = (str: string | null | undefined): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Capitalizes user names (firstName and lastName)
 */
export const capitalizeUserNames = (user: any): any => {
  if (!user) return user;

  const capitalized = { ...user };

  if (user.firstName) {
    capitalized.firstName = capitalizeFirstLetter(user.firstName);
  }

  if (user.lastName) {
    capitalized.lastName = capitalizeFirstLetter(user.lastName);
  }

  return capitalized;
};

/**
 * Capitalizes names in an array of users
 */
export const capitalizeUsersArray = (users: any[]): any[] => {
  if (!Array.isArray(users)) return users;
  return users.map(user => capitalizeUserNames(user));
};

/**
 * Recursively capitalizes user names in nested objects (e.g., user in business)
 */
export const capitalizeNestedUserNames = (data: any): any => {
  if (!data) return data;

  if (Array.isArray(data)) {
    return data.map(item => capitalizeNestedUserNames(item));
  }

  if (typeof data === 'object') {
    const capitalized: any = { ...data };

    // Capitalize user names if user object exists
    if (capitalized.user) {
      capitalized.user = capitalizeUserNames(capitalized.user);
    }

    // Recursively process nested objects
    for (const key in capitalized) {
      if (typeof capitalized[key] === 'object' && capitalized[key] !== null) {
        capitalized[key] = capitalizeNestedUserNames(capitalized[key]);
      }
    }

    // Also capitalize firstName and lastName at root level
    if (capitalized.firstName) {
      capitalized.firstName = capitalizeFirstLetter(capitalized.firstName);
    }
    if (capitalized.lastName) {
      capitalized.lastName = capitalizeFirstLetter(capitalized.lastName);
    }

    return capitalized;
  }

  return data;
};

