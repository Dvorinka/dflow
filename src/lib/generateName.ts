import {
  Config,
  NumberDictionary,
  adjectives,
  animals,
  uniqueNamesGenerator,
} from 'unique-names-generator'

export const handleGenerateName = (length: number = 4): string => {
  const numberDictionary = NumberDictionary.generate({ min: 100, max: 999 })

  const nameConfig: Config = {
    dictionaries: [['dFlow'], adjectives, animals, numberDictionary],
    separator: '-',
    length,
    style: 'lowerCase',
  }

  return uniqueNamesGenerator(nameConfig)
}
